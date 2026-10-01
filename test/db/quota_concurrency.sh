#!/usr/bin/env bash
# U2 task 1.4: fx_consume_quota() under genuine concurrency.
#
# The quota gate is a single `INSERT .. ON CONFLICT DO UPDATE .. WHERE
# used+cost <= quota_limit`. That is only correct if the WHERE is
# re-evaluated against the row version the loser just committed, which Postgres
# does while holding the conflicting row's lock. A read-then-write
# implementation lets several tabs pass the same cap at once, so this harness
# drives N *simultaneous* psql sessions at one user and then asserts, from a
# separate session, that
#   - exactly the affordable number of calls was granted,
#   - the ledger never crossed the cap,
#   - no caller was handed a value the cap forbids,
#   - a bystander's ledger is untouched.
#
# Run through test/db/run.sh.

set -euo pipefail

container="$1"
alice="$2"
mallory="$3"
tx="$4" # the RPC invocation as SQL, e.g. "public.fx_consume_quota"

psql_db() { docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

psql_db -q -c 'drop table if exists public.fx_quota_test_results;' \
           -c 'drop table if exists public.fx_quota_test_rounds;' \
           -c 'create table public.fx_quota_test_results (
                round text not null,
                worker int not null,
                granted bigint not null);' \
           -c 'create table public.fx_quota_test_rounds (
                round text primary key,
                workers bigint not null,
                cost bigint not null,
                cap bigint not null,
                used_after bigint not null,
                granted_after bigint not null);'

log_dir="$(mktemp -d)"
trap 'rm -rf "$log_dir"' EXIT

# launch <round> <workers> <cost> <cap>
#
# The ledger is reset once, then `workers` independent psql sessions reach the
# RPC inside the same ~40ms window and block on the same fx_quota row, exactly
# like concurrent edge-function invocations would. Results are committed to a
# scratch table because a separate session has to read them afterwards.
launch() {
  local round="$1" workers="$2" cost="$3" cap="$4" i out

  psql_db -q -c "insert into public.fx_quota (user_id, used, quota_limit, window_start, updated_at)
                   values ('$alice', 0, $cap, now(), now())
                 on conflict (user_id) do update
                   set used = 0, quota_limit = $cap, window_start = now(), updated_at = now();" >/dev/null

  for i in $(seq 1 "$workers"); do
    docker exec "$container" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -c \
      "do \$\$
       declare v_start timestamptz := clock_timestamp() + interval '250 milliseconds';
       begin
         -- Real rendezvous. A random sleep only spreads the workers out, and a
         -- read-then-write implementation then passes every round because each
         -- worker happens to start after the last one committed. Spinning to a
         -- shared wall-clock instant puts all of them inside the same instant,
         -- which is the only way the race is actually observable.
         while clock_timestamp() < v_start loop
           perform pg_sleep(0.002);
         end loop;
       end \$\$;
       insert into public.fx_quota_test_results (round, worker, granted)
       values ('$round', $i, $tx('$alice'::uuid, $cost::bigint, interval '1 hour'));" \
      >"$log_dir/$round-$i.log" 2>&1 &
  done
  wait

  # -q suppresses notices but not a SELECT's result set, so the sleep is wrapped
  # in a DO block (no rows) and any worker output at all is treated as a failure.
  for i in $(seq 1 "$workers"); do
    out="$(<"$log_dir/$round-$i.log")"
    if [ -n "$out" ]; then
      echo "FAIL: worker $round/$i reported:" >&2
      echo "$out" >&2
      exit 1
    fi
    rm -f "$log_dir/$round-$i.log"
  done

  # Snapshot the ledger now: each round resets it, so the post-state has to be
  # captured while this round's result is still the one on the row.
  psql_db -q -c "insert into public.fx_quota_test_rounds
                   (round, workers, cost, cap, used_after, granted_after)
                 select '$round', $workers, $cost, $cap, q.used,
                        (select count(*) from public.fx_quota_test_results w
                          where w.round = '$round' and w.granted > 0)
                   from public.fx_quota q where q.user_id = '$alice';" >/dev/null
}

# Task 1.4 verbatim: two simultaneous calls, the cap affords exactly one.
launch two 2 500 500
# Oversubscribed burst: 12 calls, cap 1000, cost 100 -> 10 granted.
launch burst 12 100 1000
# Non-divisible cap: 7 calls, cost 30, cap 100 -> 3 granted, 90 used. A racing
# implementation shows up here as a 4th grant, which the aligned rounds above
# cannot distinguish from luck.
launch ragged 7 30 100

psql_db -q -f - <<SQL
\set ON_ERROR_STOP on
\echo '--- fx_consume_quota concurrency ---'
do \$\$
declare
  alice constant uuid := '$alice';
  r record;
begin
  if (select count(*) from public.fx_quota_test_rounds) <> 3 then
    raise exception 'expected 3 completed rounds, got %',
      (select count(*) from public.fx_quota_test_rounds);
  end if;

  for r in select * from public.fx_quota_test_rounds order by round loop
    -- Exactly floor(cap/cost) calls may be granted; one more is the overshoot a
    -- read-then-write implementation produces.
    if r.granted_after <> (r.cap / r.cost) then
      raise exception 'round %: % concurrent calls of % against a cap of % must grant exactly %, got %',
        r.round, r.workers, r.cost, r.cap, r.cap / r.cost, r.granted_after;
    end if;

    if r.used_after <> (r.cap / r.cost) * r.cost then
      raise exception 'round %: ledger must land on %, got %',
        r.round, (r.cap / r.cost) * r.cost, r.used_after;
    end if;

    if r.used_after > r.cap then
      raise exception 'round %: quota overshoot, used % > cap %', r.round, r.used_after, r.cap;
    end if;

    -- The value a caller was handed is its post-write total, so a value above
    -- the cap is the overshoot itself.
    if exists (select 1 from public.fx_quota_test_results w
               where w.round = r.round and w.granted > r.cap) then
      raise exception 'round %: a caller received a grant above the cap of %', r.round, r.cap;
    end if;
  end loop;

  -- A bystander's ledger is untouched: the gate is per user.
  if exists (select 1 from public.fx_quota where user_id = '$mallory') then
    raise exception 'quota leaked across users';
  end if;

  -- The check constraint is the last line of defence behind the WHERE clause.
  if not exists (select 1 from pg_constraint where conname = 'fx_quota_used_within_limit') then
    raise exception 'fx_quota must carry the used <= quota_limit check constraint';
  end if;
end \$\$;
\echo 'OK: quota_concurrency'
SQL

psql_db -q -c 'drop table if exists public.fx_quota_test_results;' \
           -c 'drop table if exists public.fx_quota_test_rounds;'
