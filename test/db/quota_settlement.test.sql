-- fx-gateway quota settlement assertions — work unit U4a.
--
-- Run by test/db/run.sh after `supabase db reset`, so the schema under test is
-- the one supabase/migrations produces from empty.
--
-- Why these are SQL and not TypeScript: the claim being made is about a single
-- UPDATE under the table's own CHECK constraints, with two isolation properties.
-- Neither is reachable through the edge function's HTTP surface without also
-- inventing a fake upstream, so asserting them here is the honest level.
--
-- Each case fails loudly via a raised exception under ON_ERROR_STOP, so there
-- are no "expected failure" booleans to get wrong.
--
-- ORDER IS LOAD-BEARING. The two isolation cases run first, on purpose. A fault
-- that reaches "somebody else's row" or "a row that does not exist" is
-- invisible until a second user exists, and schema_rls.test.sql and
-- quota_concurrency.sh both leave rows behind — so with them last, such a fault
-- trips an earlier case instead and the isolation assertions are never actually
-- exercised. Found by mutation testing, which reported the fault as caught by
-- the wrong assertion; that is a defect in the tests, not a pass.

\set u1 '33333333-3333-3333-3333-333333333333'
\set u2 '44444444-4444-4444-4444-444444444444'

-- Start from a table holding only what this file puts in it, so "did this
-- settlement reach a row it had no business reaching" has exactly one answer.
delete from public.fx_quota;

-- Two helpers so the assertions below read as statements about behaviour rather
-- than as arithmetic. Each raises unless the values match.
--
-- Typed rather than `anyelement`: plpgsql will not unify a bigint return with an
-- integer literal, and will not implicitly cast bigint to text either, so one
-- polymorphic signature cannot cover both the numbers and the ACL string.
create or replace function pg_temp.assert_eq(p_label text, p_actual bigint, p_expected bigint)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: expected %, got %', p_label, p_expected, p_actual;
  end if;
end;
$$;

create or replace function pg_temp.assert_eq_text(p_label text, p_actual text, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: expected %, got %', p_label, p_expected, p_actual;
  end if;
end;
$$;

create or replace function pg_temp.reset_quota(p_user uuid, p_limit bigint)
returns void
language sql
as $$
  insert into public.fx_quota (user_id, used, quota_limit, window_start, updated_at)
  values (p_user, 0, p_limit, now(), now())
  on conflict (user_id) do update
    set used = 0, quota_limit = p_limit, window_start = now(), updated_at = now();
$$;

-- The subject of case 1. The identity has to exist so the case is about
-- "settlement must not invent a ledger row", not about a foreign key: with no
-- auth.users row, any implementation that tried to insert would fail on the FK
-- first, and the assertion below would never be reached.
with fx_identities (id) as (
  values
    ('33333333-3333-3333-3333-333333333333'::uuid),
    ('44444444-4444-4444-4444-444444444444'::uuid),
    ('55555555-5555-5555-5555-555555555555'::uuid)
)
insert into auth.users (id) select id from fx_identities on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. A settlement for a user who was never charged is a no-op
-- ---------------------------------------------------------------------------
-- Settlement is a debit, not a charge. If it could invent a ledger row, it would
-- hand out free quota — so it must not insert.
select pg_temp.assert_eq('unknown user settles to nothing', public.fx_settle_quota('55555555-5555-5555-5555-555555555555', 200000, 0), 0);
select pg_temp.assert_eq('no row was created', (select count(*) from public.fx_quota where user_id = '55555555-5555-5555-5555-555555555555'), 0);

-- ---------------------------------------------------------------------------
-- 2. Another user's ledger is not reachable
-- ---------------------------------------------------------------------------
select pg_temp.reset_quota(:'u2', 20000000);
select pg_temp.assert_eq('other user reserves', public.fx_consume_quota(:'u2', 1000, '24:00:00'::interval, 20000000), 1000);
-- Settling against u1 with u1's reservation must leave u2 exactly where it was.
select pg_temp.assert_eq('foreign settle is a no-op', public.fx_settle_quota(:'u1', 200000, 0, '24:00:00'::interval), 0);
select pg_temp.assert_eq('other user untouched', (select used from public.fx_quota where user_id = :'u2'), 1000);

-- ---------------------------------------------------------------------------
-- 3. A settlement is a debit, not a second charge
-- ---------------------------------------------------------------------------
select pg_temp.reset_quota(:'u1', 20000000);
select pg_temp.assert_eq('reserve', public.fx_consume_quota(:'u1', 200000, '24:00:00'::interval, 20000000), 200000);
-- Real usage was 34000 tokens: the unused 166000 must come back.
select pg_temp.assert_eq('settle after refund', public.fx_settle_quota(:'u1', 200000, 34000, '24:00:00'::interval), 34000);
select pg_temp.assert_eq('row matches', (select used from public.fx_quota where user_id = :'u1'), 34000);

-- ---------------------------------------------------------------------------
-- 4. An overrun is charged, not clamped away
-- ---------------------------------------------------------------------------
select pg_temp.reset_quota(:'u1', 20000000);
select pg_temp.assert_eq('reserve again', public.fx_consume_quota(:'u1', 200000, '24:00:00'::interval, 20000000), 200000);
select pg_temp.assert_eq('settle after overrun', public.fx_settle_quota(:'u1', 200000, 300000, '24:00:00'::interval), 300000);

-- ---------------------------------------------------------------------------
-- 5. A zero-token answer refunds the whole reservation
-- ---------------------------------------------------------------------------
select pg_temp.reset_quota(:'u1', 20000000);
select pg_temp.assert_eq('reserve 5', public.fx_consume_quota(:'u1', 200000, '24:00:00'::interval, 20000000), 200000);
select pg_temp.assert_eq('settle to zero', public.fx_settle_quota(:'u1', 200000, 0, '24:00:00'::interval), 0);

-- ---------------------------------------------------------------------------
-- 6. An overrun cannot push the ledger past the cap
-- ---------------------------------------------------------------------------
-- The point of `least(quota_limit, ...)`: without it this statement raises the
-- table's `used <= quota_limit` CHECK and the caller sees a 502 instead of a
-- generation. The un-clamped value would be 5,000,000 against a 1,000,000 cap.
select pg_temp.reset_quota(:'u1', 1000000);
select pg_temp.assert_eq('reserve 6', public.fx_consume_quota(:'u1', 200000, '24:00:00'::interval, 1000000), 200000);
select pg_temp.assert_eq('overrun clamps at the cap', public.fx_settle_quota(:'u1', 200000, 5000000, '24:00:00'::interval), 1000000);

-- ---------------------------------------------------------------------------
-- 7. An over-refund cannot drive the ledger negative
-- ---------------------------------------------------------------------------
-- Two interleaved settlements can each believe their own reservation is intact.
-- `greatest(0, ...)` is what keeps the `used >= 0` CHECK from raising.
select pg_temp.reset_quota(:'u1', 20000000);
select pg_temp.assert_eq('reserve 7', public.fx_consume_quota(:'u1', 500, '24:00:00'::interval, 20000000), 500);
select pg_temp.assert_eq('over-refund floors at zero', public.fx_settle_quota(:'u1', 500, 0, '24:00:00'::interval), 0);
select pg_temp.assert_eq('second, double refund', public.fx_settle_quota(:'u1', 500, 0, '24:00:00'::interval), 0);

-- ---------------------------------------------------------------------------
-- 8. A settlement never touches a window it does not own
-- ---------------------------------------------------------------------------
-- If the rolling window rolled between reserve and settle, subtracting this
-- call's tokens from a *fresh* window's total would silently under-charge the
-- next real call. The WHERE skips the row and reports nothing to settle.
select pg_temp.reset_quota(:'u1', 20000000);
update public.fx_quota set used = 1234, window_start = now() - interval '2 days' where user_id = :'u1';
select pg_temp.assert_eq('stale window is left alone', public.fx_settle_quota(:'u1', 200000, 34000, '24:00:00'::interval), 0);
select pg_temp.assert_eq('stale row untouched', (select used from public.fx_quota where user_id = :'u1'), 1234);

-- ---------------------------------------------------------------------------
-- 9. The argument guards raise, so a bad caller cannot move the ledger
-- ---------------------------------------------------------------------------
-- Without these, a negative `p_actual` is a refund larger than any reservation,
-- and a zero/negative `p_reserved` makes the arithmetic meaningless. Each is
-- asserted by the exception actually firing, not by a boolean we chose.
--
-- psql does not interpolate :'var' inside a dollar-quoted block, so the id is
-- written out literally here.
do $$
declare
  v_failed text;
begin
  v_failed := null;
  begin
    perform public.fx_settle_quota('33333333-3333-3333-3333-333333333333', 200000, -1);
  exception when others then
    v_failed := 'negative actual';
  end;
  if v_failed is distinct from 'negative actual' then
    raise exception 'FAIL a negative p_actual was accepted';
  end if;

  v_failed := null;
  begin
    perform public.fx_settle_quota('33333333-3333-3333-3333-333333333333', 0, 10);
  exception when others then
    v_failed := 'zero reserved';
  end;
  if v_failed is distinct from 'zero reserved' then
    raise exception 'FAIL a zero p_reserved was accepted';
  end if;

  v_failed := null;
  begin
    perform public.fx_settle_quota('33333333-3333-3333-3333-333333333333', 200000, 10, interval '0 seconds');
  exception when others then
    v_failed := 'zero window';
  end;
  if v_failed is distinct from 'zero window' then
    raise exception 'FAIL a zero p_window was accepted';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Only the service role may settle
-- ---------------------------------------------------------------------------
-- Same hole as fx_consume_quota: with p_user_id as a parameter, a PUBLIC grant
-- would let any signed-in tab refund another account. Asserted from pg_proc, the
-- only place the ACL actually lives.
select pg_temp.assert_eq_text(
  'fx_settle_quota is granted to service_role alone',
  (select array_to_string(proacl, ',') from pg_proc where proname = 'fx_settle_quota'),
  'postgres=X/postgres,service_role=X/postgres'
);

-- ---------------------------------------------------------------------------
-- 11. The reserve/settle pair preserves the cap under exhaustion
-- ---------------------------------------------------------------------------
-- The property that matters across the pair: once the ledger is at its cap,
-- nothing — not a reservation, not a settlement — pushes it past. Reservation is
-- serialised by fx_consume_quota's ON CONFLICT WHERE; settlement only moves a
-- row's own held units and is clamped.
select pg_temp.reset_quota(:'u1', 1000);
select pg_temp.assert_eq('cap holds at 1000', public.fx_consume_quota(:'u1', 1000, '24:00:00'::interval, 1000), 1000);
select pg_temp.assert_eq('further reservation refused', public.fx_consume_quota(:'u1', 1, '24:00:00'::interval, 1000), 0);
select pg_temp.assert_eq('cap still holds', (select used from public.fx_quota where user_id = :'u1'), 1000);

drop function pg_temp.assert_eq(text, bigint, bigint);
drop function pg_temp.assert_eq_text(text, text, text);
drop function pg_temp.reset_quota(uuid, bigint);
delete from public.fx_quota where user_id in (:'u1', :'u2');
delete from auth.users where id in (:'u1', :'u2', '55555555-5555-5555-5555-555555555555');
