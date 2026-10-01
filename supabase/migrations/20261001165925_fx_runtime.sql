-- Mizpa FX runtime schema — work unit U2 (SDD tasks 1.3 + 1.4)
-- Migration: 20261001090000
--
-- ADDITIVE ONLY. This migration is deliberately revertible on its own: it adds
-- columns, policies, a bucket and an RPC, and drops nothing that exists today.
-- The freestyle cleanup is NOT here — obs #14 established that
-- `supabase/functions/run-agent/` still reads `freestyle_vm_id` and
-- `freestyle_repo_id`, so those columns must survive until U17 deletes that
-- function. Reverting U2 leaves a database exactly as it was, which is what
-- makes it a safe first slice of the cutover.
--
-- It must also ship BEFORE any fx code path (design decision 6): `runtime` and
-- `runtime_session` are read by the future `src/lib/fx/*` modules, and the
-- `sites` UPDATE policy below is the only reason a browser holding the anon
-- key can write `runtime_session` at all.

-- ---------------------------------------------------------------------------
-- 1. sites.runtime — the runtime discriminator
-- ---------------------------------------------------------------------------
-- Default 'fx', not 'freestyle', because the cutover is clean (obs #7): there
-- is no second live engine to route to. The column survives as observability
-- and as a rollback lever, not as a router — no fx code reads it to decide
-- anything.
--
-- This contradicts the spec requirement "Runtime discriminator, freestyle
-- default". The spec still describes the abandoned hybrid; design decision 6
-- and obs #7 supersede it and the spec needs that amendment. Recorded rather
-- than silently reconciled.
alter table public.sites
  add column if not exists runtime text not null default 'fx';

-- ---------------------------------------------------------------------------
-- 2. sites.runtime_session — per-turn fx session state
-- ---------------------------------------------------------------------------
-- Shape is owned by src/lib/fx/checkpoint.ts (U8), which is not in this slice,
-- so nothing here constrains it beyond jsonb. `restart = 'cold_start'` is the
-- one key U8 writes on a hash/version mismatch; a default of {} means a caller
-- that forgets to seed the column reads a well-typed value instead of NULL.
alter table public.sites
  add column if not exists runtime_session jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. The missing sites UPDATE policy
-- ---------------------------------------------------------------------------
-- Before this, `sites` had RLS for SELECT and INSERT only (obs #12). A browser
-- write of `runtime_session` with the anon key was silently rejected: PostgREST
-- returns an empty result rather than an error, so the symptom would have been
-- "my turn keeps restarting" with nothing in any log. This is the policy that
-- unblocks it.
--
-- WITH CHECK restates USING rather than adding to it. Postgres already falls
-- back to USING for the post-image check when WITH CHECK is omitted (verified
-- in this database: dropping WITH CHECK still refuses an ownership transfer),
-- so this is belt-and-braces. It is written out anyway because that fallback is
-- invisible at the call site — the first person to widen USING for some other
-- reason would otherwise widen the post-image check with it, silently.
--
-- Scope note: this widens owner UPDATE from "nothing" to "any column", which
-- now includes `status` and the cloudflare_* fields. Narrowing it per column is
-- not expressible in RLS, so it is accepted deliberately and recorded here;
-- the fields a user can now self-assign are ones only the service role reads.
create policy "Users can update own sites" on public.sites
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Checkpoint storage
-- ---------------------------------------------------------------------------
-- Private: checkpoint bytes are the user's conversation and file tree.
--
-- Object keys are namespaced per user as `{user_id}/{site_id}.fx`, which is
-- what the policies below key on. A site id alone would force the policy into
-- a join against public.sites on every object access; the folder prefix makes
-- the same guarantee a pure string comparison, and lets Storage enforce it
-- without reading another schema.
--
-- file_size_limit is a ceiling, not a target. A checkpoint is
-- conversation + usage, so 5 MiB is roughly three orders of magnitude above a
-- realistic one and exists only so a runaway loop cannot fill the bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values ('site-checkpoints', 'site-checkpoints', false, 5 * 1024 * 1024)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- storage.objects is RLS-enabled with no policy of its own, so these four are
-- the whole of a user's reach into the bucket. Each is scoped twice: by
-- bucket_id and by the owner folder prefix. `owner` is the uuid the Storage
-- API stamps from the JWT; the WITH CHECK clauses keep a user from writing into
-- a folder that is not theirs.
create policy "Users read own site checkpoints" on storage.objects
  for select
  using (
    bucket_id = 'site-checkpoints'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users upload own site checkpoints" on storage.objects
  for insert
  with check (
    bucket_id = 'site-checkpoints'
    and (storage.foldername(name))[1] = auth.uid()::text
    and owner = auth.uid()
  );

-- UPDATE is what a per-turn checkpoint rewrite needs; without it the browser
-- can only ever write a new object and would accumulate one per turn.
create policy "Users update own site checkpoints" on storage.objects
  for update
  using (
    bucket_id = 'site-checkpoints'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'site-checkpoints'
    and (storage.foldername(name))[1] = auth.uid()::text
    and owner = auth.uid()
  );

create policy "Users delete own site checkpoints" on storage.objects
  for delete
  using (
    bucket_id = 'site-checkpoints'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 5. fx_quota — the AI Gateway spend ledger
-- ---------------------------------------------------------------------------
-- A table plus one RPC, not a counter held in the edge function (design
-- decision 2). A function-local counter is dead the moment the isolate is
-- evicted, and it is re-seeded from zero on every cold start, so a single tab
-- could spend without bound simply by surviving between requests. Postgres
-- holds the number, every charge is one durable row update, and the ledger is
-- auditable after the fact.
--
-- One row per user; the window columns support a rolling period so a user is
-- not locked out forever.
create table if not exists public.fx_quota (
  user_id uuid primary key references auth.users (id) on delete cascade,
  used bigint not null default 0,
  quota_limit bigint not null default 200000,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fx_quota_used_non_negative check (used >= 0),
  constraint fx_quota_limit_positive check (quota_limit > 0),
  -- Last line of defence. The RPC's ON CONFLICT WHERE already refuses to cross
  -- the cap; this makes "the ledger cannot exceed the limit" a schema fact
  -- rather than a property of one function body.
  constraint fx_quota_used_within_limit check (used <= quota_limit)
);

create index if not exists idx_fx_quota_window on public.fx_quota (window_start);

comment on table public.fx_quota is
  'Per-user AI Gateway spend ledger for fx-gateway. Written only through fx_consume_quota(); quota_limit is a cost budget (owner: Mizpa), not tokens.';
comment on column public.fx_quota.window_start is
  'Start of the rolling window; a window older than the RPC''s p_window resets used to the new charge.';

alter table public.fx_quota enable row level security;

-- Mirrors the pattern already used for `sites`: the service role owns the
-- ledger, no client role gets table access. The RPC below is SECURITY DEFINER,
-- so it reaches the row without any client-facing grant.
create policy "Service role full access to fx_quota" on public.fx_quota
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 6. fx_consume_quota() — the atomic charge
-- ---------------------------------------------------------------------------
-- Returns the user's new `used` total on success, or 0 when the charge would
-- cross the cap. fx-gateway maps that 0 to the spec's 403 with the upstream
-- untouched.
--
-- The atomicity is the whole point and it comes from one statement:
--
--   INSERT .. ON CONFLICT DO UPDATE .. WHERE used + cost <= quota_limit
--
-- A concurrent caller blocks on the conflicting row's lock, and Postgres
-- re-evaluates the WHERE against the version the winner just committed. So two
-- simultaneous calls cannot both see room for the last unit of quota: the
-- loser's WHERE is false against the post-lock row and no row is returned.
--
-- Deliberately NOT a "read, compare in plpgsql, then write" sequence. That
-- form has a window between the SELECT and the UPDATE where N callers all read
-- the same stale total and all pass. The condition is repeated in both the SET
-- and the WHERE rather than computed into a variable, because a plpgsql
-- variable would have to be populated by a separate SELECT — the race, moved
-- rather than closed. The duplication is the cost of keeping the decision
-- inside one statement.
--
-- SECURITY DEFINER: the table has RLS on with no client grant, and the caller
-- of this function is the service role inside fx-gateway, not the browser.
--
-- p_user_id is caller-supplied and therefore not trusted; the EXECUTE revokes
-- below are the control that stops any signed-in tab from charging another
-- account's budget.
create or replace function public.fx_consume_quota(
  p_user_id uuid,
  p_cost bigint,
  p_window interval default interval '1 day',
  p_default_limit bigint default 200000
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used bigint;
  v_reset boolean;
begin
  if p_cost <= 0 then
    raise exception 'fx_consume_quota: cost must be positive, got %', p_cost
      using errcode = '22023';
  end if;

  if p_window is null or p_window <= interval '0 seconds' then
    raise exception 'fx_consume_quota: window must be positive, got %', p_window
      using errcode = '22023';
  end if;

  insert into public.fx_quota as q (user_id, used, quota_limit, window_start, updated_at)
  values (p_user_id, p_cost, p_default_limit, now(), now())
  on conflict (user_id) do update
     set used = case
                  when q.window_start + p_window <= now() then p_cost
                  else q.used + p_cost
                end,
         window_start = case
                          when q.window_start + p_window <= now() then now()
                          else q.window_start
                        end,
         updated_at = now()
   where (case
             when q.window_start + p_window <= now() then p_cost
             else q.used + p_cost
           end) <= q.quota_limit
  returning q.used into v_used;

  -- No row returned means the WHERE refused the write: quota exhausted, and the
  -- existing row is untouched. 0 is the denial signal.
  return coalesce(v_used, 0);
end;
$$;

comment on function public.fx_consume_quota(uuid, bigint, interval, bigint) is
  'Atomically charge p_cost against a user''s fx_quota budget. Returns the new used total, or 0 when the charge would exceed quota_limit. Callable only by the service role.';

-- EXECUTE is granted to PUBLIC by default on every function. That default is
-- the hole: with p_user_id as a parameter, any tab holding a valid session could
-- charge an arbitrary account and lock it out. Revoke first, then grant
-- service_role alone. anon is listed explicitly because PostgREST routes
-- unauthenticated traffic through it, so leaving it behind would expose this
-- to logged-out visitors too.
revoke all on function public.fx_consume_quota(uuid, bigint, interval, bigint)
  from public, anon, authenticated;
grant execute on function public.fx_consume_quota(uuid, bigint, interval, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. updated_at maintenance
-- ---------------------------------------------------------------------------
-- public.handle_updated_at() already exists (migration 20260626181721) but was
-- only ever attached to `tasks`. `sites` has an updated_at column that nothing
-- maintained, and U9 starts writing sites from the browser on every turn.
--
-- DO $$ guards against attaching twice: a re-run of this migration would
-- otherwise fail on a duplicate trigger name rather than being a no-op.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.sites'::regclass
      and tgname = 'sites_updated_at'
      and not tgisinternal
  ) then
    create trigger sites_updated_at
      before update on public.sites
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;
