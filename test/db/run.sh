#!/usr/bin/env bash
# Mizpa DB test harness — work unit U2 (tasks 1.3 + 1.4).
#
# Runs `test/db/*.test.sql` against a real local Supabase Postgres (the schema
# these migrations target: `auth`, `storage` and `public` with Supabase's
# default roles). Requires Docker; nothing else on the host.
#
# Usage:
#   npm run test:db
#   HEADLESS=... npx playwright test   # the browser suite is unaffected
#
# Why a shell driver instead of Playwright: these assertions are SQL, and the
# ones that matter (RLS under `set local role authenticated`, and two sessions
# racing on `fx_consume_quota`) cannot be expressed through a browser.
# Playwright stays the E2E gate — see `playwright.config.ts`.

set -euo pipefail

SUPABASE_CLI="${SUPABASE_CLI:-supabase@2.119.0}"
DB_IMAGE='public.ecr.aws/supabase/postgres'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql_db() { docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

# --- 1. database up, every migration in supabase/migrations applied -----------
# `db reset` rather than `db start`: the migration has to be proven from a clean
# database, and a stack that already ran it would prove nothing. The missing
# supabase/seed.sql is a pre-existing config gap (obs #12) and only emits a
# notice — migrations still apply.
echo "==> supabase db reset (rebuilds the database from supabase/migrations)"
npx -y "$SUPABASE_CLI" db reset >/dev/null

container="$(docker ps --format '{{.Names}} {{.Image}}' | awk -v img="$DB_IMAGE" '$2 ~ img {print $1; exit}')"
if [ -z "$container" ]; then
  echo "FAIL: no running container from $DB_IMAGE; is Docker up?" >&2
  exit 1
fi
echo "==> database container: $container"

cleanup() { psql_db -q -c 'drop table if exists public.fx_quota_test_results;' >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

# --- 2. schema / RLS / storage / RPC assertions ------------------------------
echo "==> test/db/schema_rls.test.sql"
psql_db -q -f - <"$here/schema_rls.test.sql"

# --- 3. fx_consume_quota concurrency ----------------------------------------
# The quota gate is only correct if it holds under contention, so the rounds
# below run as N genuinely concurrent psql sessions and check afterwards that
# the ledger never crossed the cap and that exactly the expected number of
# calls were granted.
echo "==> test/db/quota_concurrency.sh"
bash "$here/quota_concurrency.sh" \
  "$container" \
  11111111-1111-1111-1111-111111111111 \
  22222222-2222-2222-2222-222222222222 \
  'public.fx_consume_quota'

echo "==> U2 db tests OK"
