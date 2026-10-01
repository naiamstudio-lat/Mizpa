-- U2 assertions: sites.runtime / runtime_session, the sites UPDATE RLS policy,
-- the site-checkpoints bucket + storage.objects policies, fx_quota and the
-- atomic fx_consume_quota() RPC.
--
-- Every check raises on failure, so `psql -v ON_ERROR_STOP=1` exits non-zero
-- with a message naming the assertion. Run through test/db/run.sh.

\set ON_ERROR_STOP on

-- Idempotent: a previously failing run may have left fixtures behind, and the
-- relations U2 adds do not exist on a pre-U2 database.
set storage.allow_delete_query = 'true';
do $$
begin
  execute 'delete from storage.objects where bucket_id in ('
    || quote_literal('site-checkpoints') || ', ' || quote_literal('unrelated-bucket') || ')';
  if to_regclass('public.fx_quota') is not null then
    execute 'delete from public.fx_quota';
  end if;
  if to_regclass('public.sites') is not null then
    execute 'delete from public.sites where id in ('
      || quote_literal('aaaaaaaa-0000-0000-0000-000000000001') || ', '
      || quote_literal('aaaaaaaa-0000-0000-0000-000000000002') || ')';
  end if;
end $$;
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
delete from storage.buckets where id = 'unrelated-bucket';

-- Fixture identities. Two users, because every isolation assertion needs a
-- bystander whose rows must stay unreachable.
create temporary table fx_u (who text primary key, id uuid);
insert into fx_u values
  ('alice', '11111111-1111-1111-1111-111111111111'),
  ('mallory', '22222222-2222-2222-2222-222222222222'),
  ('quota_user', '33333333-3333-3333-3333-333333333333'),
  ('fresh_user', '44444444-4444-4444-4444-444444444444');

insert into auth.users (id) select id from fx_u;

insert into public.sites (id, organization_id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'alice_site'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', 'mallory_site');

-- A second bucket proves the storage policies are scoped to
-- `site-checkpoints` instead of granting blanket access to storage.objects.
insert into storage.buckets (id, name) values ('unrelated-bucket', 'unrelated-bucket');

-- Shared assertion for every RLS case below. Eight of them assert the same two
-- things — "this statement touched exactly N rows" — and each one needs the
-- 42501 catch, because a refused RLS write raises rather than returning zero.
-- SECURITY INVOKER on purpose: it must run as whichever role the surrounding
-- `set local role` established, or the policies under test are not the ones
-- being exercised.
create or replace function pg_temp.assert_rows(label text, dml text, expected int)
returns void language plpgsql as $fn$
declare n int := 0;
begin
  begin
    execute dml;
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := 0;
  end;
  if n <> expected then
    raise exception '%: expected % row(s), got %', label, expected, n;
  end if;
end $fn$;

\echo '--- sites columns ---'
do $$
declare v text;
begin
  -- pg_attribute is the only place the raw `DEFAULT` expression survives;
  -- information_schema spells it `column_default` and quoting `default` is a
  -- reserved word inside plpgsql.
  select pg_get_expr(d.adbin, d.adrelid) into v
    from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.sites'::regclass and a.attname = 'runtime';
  if v is distinct from '''fx''::text' then
    raise exception 'sites.runtime must default to ''fx'', got %', coalesce(v, '<missing>');
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.sites'::regclass and attname = 'runtime'
      and attnotnull and atttypid = 'text'::regtype
  ) then
    raise exception 'sites.runtime must be NOT NULL text';
  end if;

  select pg_get_expr(d.adbin, d.adrelid) into v
    from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.sites'::regclass and a.attname = 'runtime_session';
  if v is distinct from '''{}''::jsonb' then
    raise exception 'sites.runtime_session must default to {}, got %', coalesce(v, '<missing>');
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.sites'::regclass and attname = 'runtime_session'
      and attnotnull and atttypid = 'jsonb'::regtype
  ) then
    raise exception 'sites.runtime_session must be NOT NULL jsonb';
  end if;
end $$;

-- Rollback is a real test for U17 (which drops the freestyle columns), so it
-- lives in the migration, not here.
do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'sites'
        and column_name in ('freestyle_vm_id', 'freestyle_repo_id')) <> 2 then
    raise exception 'U2 must not drop freestyle_vm_id / freestyle_repo_id (U17 owns that)';
  end if;
end $$;

\echo '--- sites UPDATE RLS under an authenticated session ---'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  -- runtime_session round-trips, so the write is a real value and not a NULL.
  select pg_temp.assert_rows('owner writes sites.runtime_session',
    $$update public.sites set runtime_session = '{"restart":"cold_start"}'::jsonb
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 1);

  do $$
  declare v text;
  begin
    select runtime_session::text into v from public.sites
      where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if v is distinct from '{"restart": "cold_start"}' then
      raise exception 'runtime_session did not round-trip, got %', v;
    end if;
  end $$;

  -- The discriminator is writable too: a new fx site records runtime='fx'.
  select pg_temp.assert_rows('owner writes sites.runtime',
    $$update public.sites set runtime = 'fx'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 1);

  select pg_temp.assert_rows('another user''s site is unreachable',
    $$update public.sites set runtime_session = '{}'::jsonb
      where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$, 0);

  -- Regression lock on a non-transferable row. Postgres applies USING to the
  -- post-image when WITH CHECK is omitted, so this passes either way; it is
  -- kept because it fails loudly the moment that changes.
  select pg_temp.assert_rows('sites.user_id is not reassignable by its owner',
    $$update public.sites set user_id = '22222222-2222-2222-2222-222222222222'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 0);

  do $$
  declare v uuid;
  begin
    select user_id into v from public.sites where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if v is distinct from '11111111-1111-1111-1111-111111111111'::uuid then
      raise exception 'site ownership changed to %', v;
    end if;
  end $$;
rollback;

\echo '--- site-checkpoints bucket ---'
do $$
declare n int; is_public boolean; lim bigint;
begin
  select count(*) into n from storage.buckets
    where id = 'site-checkpoints' and name = 'site-checkpoints';
  if n <> 1 then
    raise exception 'bucket site-checkpoints is missing (% rows)', n;
  end if;

  select public into is_public from storage.buckets where id = 'site-checkpoints';
  if is_public then
    raise exception 'site-checkpoints must not be public: checkpoint bytes hold user content';
  end if;

  select file_size_limit into lim from storage.buckets where id = 'site-checkpoints';
  if lim is null or lim <= 0 or lim > 5242880 then
    raise exception 'site-checkpoints file_size_limit must be capped at 5MiB, got %', lim;
  end if;
end $$;

\echo '--- storage.objects policies ---'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  select pg_temp.assert_rows('owner uploads a checkpoint',
    $$insert into storage.objects (bucket_id, name, owner)
      values ('site-checkpoints',
              '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.fx',
              '11111111-1111-1111-1111-111111111111')$$, 1);

  -- Another user's folder prefix must be refused, even for a valid site id.
  select pg_temp.assert_rows('no write into another user''s checkpoint folder',
    $$insert into storage.objects (bucket_id, name, owner)
      values ('site-checkpoints',
              '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001.fx',
              '11111111-1111-1111-1111-111111111111')$$, 0);

  -- The policies are scoped by bucket_id, so another bucket stays closed even
  -- for a name whose folder prefix WOULD pass — otherwise this would be
  -- satisfied by the folder check and never exercise the bucket scope at all.
  select pg_temp.assert_rows('no write outside site-checkpoints',
    $$insert into storage.objects (bucket_id, name, owner)
      values ('unrelated-bucket', '11111111-1111-1111-1111-111111111111/anything',
              '11111111-1111-1111-1111-111111111111')$$, 0);

  -- UPDATE is what a per-turn checkpoint rewrite needs; without it the browser
  -- would accumulate one object per turn.
  select pg_temp.assert_rows('owner overwrites a checkpoint',
    $$update storage.objects
      set name = '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.v2.fx'
      where bucket_id = 'site-checkpoints'
        and name = '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.fx'$$, 1);

  do $$
  declare n int;
  begin
    select count(*) into n from storage.objects where bucket_id = 'site-checkpoints';
    if n <> 1 then
      raise exception 'owner sees % checkpoint objects, expected exactly 1', n;
    end if;
  end $$;
rollback;

\echo '--- site-checkpoints is closed to anon ---'
begin;
  set local role anon;
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select pg_temp.assert_rows('anon cannot write to site-checkpoints',
    $$insert into storage.objects (bucket_id, name)
      values ('site-checkpoints', 'whatever.fx')$$, 0);

  do $$
  declare n int;
  begin
    select count(*) into n from storage.objects where bucket_id = 'site-checkpoints';
    if n <> 0 then
      raise exception 'anon can read % checkpoint objects', n;
    end if;
  end $$;
rollback;

\echo '--- fx_quota + fx_consume_quota ---'
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'fx_quota'
  ) then
    raise exception 'public.fx_quota table is missing';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'fx_consume_quota') then
    raise exception 'public.fx_consume_quota() is missing';
  end if;

  -- SECURITY DEFINER is what lets the gateway write the ledger while the table
  -- keeps RLS on and only the service role has table access.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'fx_consume_quota' and p.prosecdef) then
    raise exception 'fx_consume_quota() must be SECURITY DEFINER';
  end if;

  -- p_user_id is caller-supplied, so execute must not be reachable from the
  -- browser: that would let any signed-in tab charge another user's quota.
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) a
    where n.nspname = 'public' and p.proname = 'fx_consume_quota'
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
  ) then
    raise exception 'fx_consume_quota() is still executable by anon/authenticated';
  end if;

  -- ...and the grant that actually matters is present. Every execution test
  -- below runs as the postgres superuser, who holds EXECUTE no matter what the
  -- ACL says, so the ACL is the only place this can be observed.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) a
    where n.nspname = 'public' and p.proname = 'fx_consume_quota'
      and a.grantee = 'service_role'::regrole
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'fx_consume_quota() is not executable by service_role; fx-gateway would 403 every call';
  end if;
end $$;

-- A first-ever call has to provision the row itself: no separate enrolment
-- step exists between sign-up and the first model request.
do $$
declare used bigint; lim bigint;
begin
  if public.fx_consume_quota('44444444-4444-4444-4444-444444444444'::uuid, 7::bigint) <> 7 then
    raise exception 'the first call must grant and return the new total';
  end if;
  select q.used, q.quota_limit into used, lim from public.fx_quota q
    where q.user_id = '44444444-4444-4444-4444-444444444444'::uuid;
  if used is distinct from 7::bigint then
    raise exception 'a fresh user must start with used = 7, got %', used;
  end if;
  if lim is null or lim <= 0 then
    raise exception 'the first call must provision a positive default quota_limit, got %', lim;
  end if;
end $$;

do $$
declare used bigint; lim bigint; v bigint;
begin
  perform public.fx_consume_quota('33333333-3333-3333-3333-333333333333'::uuid, 100::bigint);
  perform public.fx_consume_quota('33333333-3333-3333-3333-333333333333'::uuid, 150::bigint);
  select q.used, q.quota_limit into used, lim from public.fx_quota q
    where q.user_id = '33333333-3333-3333-3333-333333333333'::uuid;
  if used is distinct from 250::bigint then
    raise exception 'two sequential calls must accumulate, ledger is % (expected 250)', used;
  end if;
  if lim is null or lim <= 0 then
    raise exception 'the first call must provision fx_quota with a positive default limit, got %', lim;
  end if;

  update public.fx_quota set quota_limit = 300
    where user_id = '33333333-3333-3333-3333-333333333333'::uuid;

  v := public.fx_consume_quota('33333333-3333-3333-3333-333333333333'::uuid, 100::bigint);
  if v <> 0 then
    raise exception 'an over-limit call must return 0 (denied), got %', v;
  end if;
  select q.used into lim from public.fx_quota q
    where q.user_id = '33333333-3333-3333-3333-333333333333'::uuid;
  if lim is distinct from 250::bigint then
    raise exception 'a denied call must not move the ledger, it is % (expected 250)', lim;
  end if;
end $$;

do $$
declare v bigint;
begin
  -- Rollover: a window older than p_window resets the counter instead of
  -- locking the user out forever. Different code path from the two cases above.
  update public.fx_quota set window_start = window_start - interval '2 hours'
    where user_id = '33333333-3333-3333-3333-333333333333'::uuid;

  v := public.fx_consume_quota(
    '33333333-3333-3333-3333-333333333333'::uuid, 40::bigint, interval '1 hour');
  if v <> 40 then
    raise exception 'an expired window must reset usage to the new cost, got %', v;
  end if;
end $$;

\echo '--- fx_consume_quota rejects bad input ---'
do $$
declare v bigint;
begin
  begin
    select public.fx_consume_quota(
      '33333333-3333-3333-3333-333333333333'::uuid, 0::bigint) into v;
    raise exception 'a zero-cost call must be rejected, it returned %', v;
  exception when sqlstate '22023' then
    null;
  end;
end $$;

do $$
begin
  begin
    perform public.fx_consume_quota('99999999-9999-9999-9999-999999999999'::uuid, 10::bigint);
    raise exception 'quota must not be creatable for a user that does not exist';
  exception when foreign_key_violation then
    null;
  end;
end $$;

\echo '--- fx_consume_quota is unreachable from the browser ---'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  do $$
  begin
    begin
      perform public.fx_consume_quota('11111111-1111-1111-1111-111111111111'::uuid, 1::bigint);
      raise exception 'an authenticated tab must not be able to call fx_consume_quota()';
    exception when insufficient_privilege then
      null;
    end;
  end $$;
rollback;

\echo 'OK: schema_rls.test.sql'
