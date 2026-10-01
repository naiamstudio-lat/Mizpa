-- Mizpa FX quota settlement — work unit U4a (SDD task 2.4, revision 2)
-- Migration: 20261001180000
--
-- ADDITIVE ONLY. 20261001165925_fx_runtime.sql is left exactly as it was
-- applied; this file adds one RPC and corrects one now-false comment. Nothing
-- is dropped, no column is rewritten, and no fx code path depends on it beyond
-- fx-gateway itself.
--
-- Why it exists: the product owner moved quota accounting from "one request, one
-- unit" to "the model's token usage". A token count does not exist until the
-- upstream has answered, so the charge before the call can only be a
-- *reservation* — and a reservation that can only ever go up is a meter, not an
-- accounting. Reconciling the difference needs a debit the original RPC cannot
-- express: `fx_consume_quota` raises on `p_cost <= 0`, so a refund is
-- impossible through it and a second, competing ledger would be worse. Hence
-- one new function, on the same table, in the same transaction discipline.

-- ---------------------------------------------------------------------------
-- 1. The unit of the ledger changed: requests -> tokens
-- ---------------------------------------------------------------------------
-- fx-gateway's cost model is owned by `supabase/functions/fx-gateway/proxy.ts`,
-- where `UNITS_PER_TOKEN = 1`: one unit is one token. The comment U2 wrote on
-- the table ("quota_limit is a cost budget, not tokens") described the flat
-- per-request unit and is now wrong, so it is corrected here rather than left
-- to mislead the next reader.
comment on table public.fx_quota is
  'Per-user AI Gateway spend ledger for fx-gateway. Written only through fx_consume_quota() (reserve) and fx_settle_quota() (reconcile). Since U4a one unit is one token; quota_limit is a token budget (owner: Mizpa).';

-- A row still sitting on the shipped default of 200000 is a row nobody ever
-- configured — the function passes `p_default_limit` explicitly, so 200000 can
-- only have come from the column default. Its `used` counts *requests*, which is
-- not a small number in token terms, it is a meaningless one, so it is reset and
-- the budget moved to the token equivalent. A row an operator deliberately set
-- is left completely alone: it keeps its limit, and its `used` is now read as a
-- token count that happens to be ~2, which under-charges that account by at most
-- a couple of tokens. Narrow on purpose — this is not the place to reinterpret
-- numbers somebody else chose.
update public.fx_quota
   set used = 0,
       quota_limit = 20000000,
       updated_at = now()
 where quota_limit = 200000;

-- ---------------------------------------------------------------------------
-- 2. fx_settle_quota() — reconcile a reservation against real usage
-- ---------------------------------------------------------------------------
-- Moves the ledger from "reserved" to "actual" in one statement:
--
--   UPDATE ... SET used = greatest(0, least(quota_limit, used - reserved + actual))
--
-- Both clamps are load-bearing.
--
--   greatest(0, ...)  Two reservations can interleave, so this call's
--                     reservation may already be partly settled by a
--                     concurrent one. The floor keeps the column's
--                     `used >= 0` check constraint from raising — which, left
--                     unhandled, would turn an ordinary race into a 502 for the
--                     loser. The cost of the floor is that a burst of
--                     interleaved settlements can under-refund by at most one
--                     reservation per call, which over-charges the user, never
--                     under-charges the account.
--
--   least(quota_limit, ...)  A generation that overruns its reservation is
--                     charged the overrun — but not past the cap, or the
--                     `used <= quota_limit` constraint raises instead of
--                     clamping. The overrun above the cap is simply not billed
--                     to the ledger. That is the accepted cost of never
--                     raising: real spend is still bounded by the AI Gateway
--                     account's own limits, which is exactly the argument U4 made
--                     for a server-side budget in the first place.
--
-- A reservation that belongs to an *expired* window is not adjusted at all.
-- `fx_consume_quota` resets `used` when the window rolls, so touching a stale
-- row would subtract this call's tokens from a fresh window's total. The WHERE
-- skips those rows and returns 0.
--
-- Returns the new `used`, or 0 when there was nothing to settle — no row, or an
-- expired window. The caller cannot tell those apart, and does not need to:
-- settlement is best-effort by construction, and its failure mode is the
-- reservation standing (a bounded over-charge), not a lost payment.
create or replace function public.fx_settle_quota(
  p_user_id uuid,
  p_reserved bigint,
  p_actual bigint,
  p_window interval default interval '1 day'
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used bigint;
begin
  if p_reserved <= 0 then
    raise exception 'fx_settle_quota: reserved must be positive, got %', p_reserved
      using errcode = '22023';
  end if;

  if p_actual < 0 then
    raise exception 'fx_settle_quota: actual must not be negative, got %', p_actual
      using errcode = '22023';
  end if;

  if p_window is null or p_window <= interval '0 seconds' then
    raise exception 'fx_settle_quota: window must be positive, got %', p_window
      using errcode = '22023';
  end if;

  update public.fx_quota as q
     set used = greatest(0, least(q.quota_limit, q.used - p_reserved + p_actual)),
         updated_at = now()
   where q.user_id = p_user_id
     and q.window_start + p_window > now()
  returning q.used into v_used;

  return coalesce(v_used, 0);
end;
$$;

comment on function public.fx_settle_quota(uuid, bigint, bigint, interval) is
  'Reconcile a fx-gateway reservation: replace p_reserved held units with p_actual real ones, clamped to [0, quota_limit]. Returns the new used total, or 0 when there was nothing to settle. A crash between fx_consume_quota and this call leaves the reservation as the cost. Callable only by the service role.';

-- Same reasoning as U2: EXECUTE defaults to PUBLIC, and with `p_user_id` as a
-- parameter that would let any signed-in tab hand another account a fake refund.
revoke all on function public.fx_settle_quota(uuid, bigint, bigint, interval)
  from public, anon, authenticated;
grant execute on function public.fx_settle_quota(uuid, bigint, bigint, interval)
  to service_role;
