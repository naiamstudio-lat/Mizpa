---
name: mizpa-supabase
description: "Trigger: supabase, edge functions, RLS, auth, database, migrations, tasks table, task_results. Supabase patterns and conventions for Mizpa."
license: Apache-2.0
metadata:
  author: naiamstudio
  version: "1.0"
---

## Activation Contract

Use when working with Supabase in Mizpa: Edge Functions, Auth, RLS policies, database migrations, or API client code.

## Hard Rules

- Always use `supabase` client from `src/lib/supabase.ts` in frontend code.
- Edge Functions use Deno imports: `https://deno.land/std@0.168.0/http/server.ts` and `https://esm.sh/@supabase/supabase-js@2`.
- Admin operations require `SUPABASE_SERVICE_ROLE_KEY` — never expose in frontend.
- All tables must have RLS enabled — no exceptions.
- Migrations go in `supabase/migrations/` with timestamp prefix.

## Architecture

```
supabase/
├── config.toml              # Local dev config (ports, auth, storage)
├── functions/
│   ├── create-task/         # Main entry: creates VM or queues
│   │   ├── index.ts         # Edge Function handler
│   │   ├── freestyle.ts     # VM API client
│   │   └── snapshot-builder.sh
│   ├── process-queue/       # Processes pgmq queue
│   ├── cleanup-vms/         # Idle VM cleanup
│   └── task-callback/       # Agent reports status back
└── migrations/
    ├── 20260626181721_create_tasks_table.sql
    └── 20260629160000_add_queued_status.sql
```

## Database Schema

**Tables:**
- `tasks` — user_id, skill (replica|audit|generate), url, status (pending|queued|running|completed|failed), vm_id
- `task_results` — task_id, result_type (audit|replica|frontend|log|error), content (jsonb)
- `vm_sessions` — task_id, vm_id, status, spec (jsonb)

**RLS Pattern:**
```sql
-- Users can only see their own tasks
create policy "Users can view own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);
```

## Edge Function Patterns

**Auth in Edge Functions:**
```typescript
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
);
const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
```

**Admin Client (server-side only):**
```typescript
const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } }
);
```

**CORS Headers (all functions):**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

## Frontend Auth

Use `useAuth` hook from `src/hooks/useAuth.ts`:
```typescript
const { user, loading, signIn, signUp, signOut } = useAuth();
```

API calls require session token:
```typescript
const { data: { session } } = await supabase.auth.getSession();
// Add to headers: Authorization: `Bearer ${session.access_token}`
```

## Gotchas

- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — only use in Edge Functions, never in frontend.
- Edge Functions run on Deno, not Node.js — use Deno APIs, not Node.js APIs.
- `pgmq` extension must be enabled for queue operations.
- `active_vm_count()` RPC function tracks VM capacity.
- Task status transitions: pending → running → completed|failed, or pending → queued → running.

## Validation

Before deploying Edge Functions:
1. Check all `Deno.env.get()` calls have fallbacks or clear error messages.
2. Verify RLS policies exist for new tables.
3. Test with both anon and service_role keys.
4. Confirm CORS headers are present in all responses.
