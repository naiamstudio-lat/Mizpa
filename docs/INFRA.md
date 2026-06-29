# Mizpa Infrastructure Architecture

## Overview

Mizpa uses a **serverless + ephemeral VM** architecture to audit websites, generate optimized React replicas, and deploy them to Cloudflare Pages. The key design constraint is **resource efficiency**: VMs live only as long as needed, tasks queue when capacity is full, and everything is tracked in PostgreSQL.

```
User → Supabase Edge Function → Task Queue (pgmq) → Freestyle VM → Results → DB
                                    ↑                    ↓
                              process-queue         cleanup-vms
```

---

## 1. Components

### 1.1 Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `create-task` | HTTP (user) | Validates, inserts task, checks capacity, creates VM or queues |
| `task-callback` | HTTP (VM) | Receives results, stores in DB, marks session as deleted, kills VM, triggers queue |
| `process-queue` | Internal/timer | Reads from pgmq `mizpa-tasks`, creates VM for next queued task |
| `cleanup-vms` | HTTP (user/UI) | Lists and deletes idle/stale VMs (safe mode or force mode) |

### 1.2 PostgreSQL (Supabase)

| Object | Purpose |
|--------|---------|
| `tasks` table | Task lifecycle: pending → queued/running → completed/failed |
| `task_results` table | Audit, replica, and deployment results |
| `vm_sessions` table | VM lifecycle tracking: creating → running → deleted |
| `pgmq` extension | Message queue `mizpa-tasks` for task backlog when at capacity |
| `pgmq.mizpa-tasks` queue | Queued tasks waiting for VM capacity |

### 1.3 Freestyle.sh VMs

| Aspect | Detail |
|--------|--------|
| Snapshot strategy | **Single snapshot** (`mizpa-agent-v5`, ~16GB) with all tools pre-installed |
| Tools | `agent.sh`, `clone_website.sh`, `generate_project.js`, `seo_geo_analyzer.py`, `deploy_cloudflare.sh` |
| Boot time | <600ms from snapshot |
| Spec | 4 vCPU, 8GB RAM, 16GB rootfs |
| Mano waste | Killed immediately after task completion |
| Safety net | `idleTimeoutSeconds: 900` (15 min auto-suspend) |

### 1.4 Cloudflare Pages

| Aspect | Detail |
|--------|--------|
| Deployment | Direct Upload API (curl + jq, no wrangler) |
| Account | `d316f1a72e1da6a4812b83721eec729c` |
| Auto-create | Project created on first deploy per site |
| Domain | `{project-name}.pages.dev` |

---

## 2. Data Flow

### 2.1 Task Lifecycle

```
create-task
  │
  ├─► insert task (status: pending)
  │
  ├─► count active vm_sessions
  │     │
  │     ├─► if < MAX_FREESTYLE_VMS (default: 3):
  │     │      ├─► create VM via freestyle API
  │     │      ├─► insert vm_sessions (status: creating → running)
  │     │      ├─► update task (status: running, vm_id)
  │     │      ├─► fire-and-forget agent execution on VM
  │     │      └─► return { status: "running", taskId, vmId }
  │     │
  │     └─► if >= MAX_FREESTYLE_VMS:
  │            ├─► update task (status: queued)
  │            ├─► pgmq.send('mizpa-tasks', { task_id, skill, url, user_id })
  │            └─► return { status: "queued", position }
  │
task-callback (VM calls back after agent.sh completes)
  │
  ├─► insert task_results
  ├─► update task (status: completed/failed, completed_at)
  ├─► update vm_sessions (status: deleted, deleted_at)
  ├─► DELETE VM via freestyle API (immediate kill)
  └─► invoke process-queue (start next queued task)

process-queue
  │
  ├─► pgmq.read('mizpa-tasks', vt=30, qty=1)
  │     │
  │     ├─► if message:
  │     │      ├─► count active vm_sessions
  │     │      ├─► if < MAX: create VM, update task to running, pgmq.delete(msg)
  │     │      └─► if >= MAX: pgmq.set_vt(msg, 30) — retry later
  │     │
  │     └─► if no message: done

cleanup-vms
  │
  ├─► list all VMs from freestyle API
  ├─► check tasks/vm_sessions for active VMs
  ├─► delete idle/stale VMs
  └─► update vm_sessions for deleted VMs
```

### 2.2 VM Lifecycle

```
creating ──► running ──► deleted
                    (task-callback or cleanup-vms)
```

### 2.3 Task State Machine

```
           ┌──────────┐
           │  pending  │
           └────┬─────┘
                │
        ┌───────┴───────┐
        │               │
   [capacity]      [no capacity]
        │               │
   ┌────▼────┐    ┌────▼────┐
   │ running  │    │  queued │
   └────┬────┘    └────┬────┘
        │              │
   [VM calls]    [VM frees up]
     back            │
        │        ┌────▼────┐
        │        │ running  │
        │        └────┬────┘
        │              │
   ┌────▼────┐    [VM calls]
   │completed│      back
   │  failed  │       │
   └─────────┘   ┌────▼────┐
                 │completed│
                 │  failed  │
                 └─────────┘
```

---

## 3. Database Schema

### 3.1 `tasks` table

Current columns plus add `queued` to status check constraint:

```sql
status text not null default 'pending'
  check (status in ('pending', 'queued', 'running', 'completed', 'failed'))
```

### 3.2 `vm_sessions` table

Already has correct schema:

```sql
create table public.vm_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  vm_id text not null,
  status text not null default 'creating'
    check (status in ('creating', 'running', 'stopping', 'stopped', 'deleted')),
  spec jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

### 3.3 `pgmq` queue

```
Queue: mizpa-tasks
Message: { task_id: uuid, skill: string, url: string, user_id: string }
```

---

## 4. Configuration

### 4.1 Environment Variables (Supabase Secrets)

| Variable | Purpose | Default |
|----------|---------|---------|
| `FREESTYLE_API_KEY` | Freestyle.sh API auth | — |
| `FREESTYLE_SNAPSHOT_ID` | Snapshot ID for VM creation | — |
| `MAX_FREESTYLE_VMS` | Max concurrent VMs | `3` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare API account | — |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB access | — |
| `SUPABASE_URL` | Supabase project URL | — |

### 4.2 Adjustable Parameters

| Parameter | Location | Default |
|-----------|----------|---------|
| `MAX_FREESTYLE_VMS` | `create-task` ENV | 3 |
| `VM_IDLE_TIMEOUT` | `create-task` ENV (passed to freestyle API) | 900s |
| `MESSAGE_VISIBILITY_TIMEOUT` | `process-queue` read param | 30s |

---

## 5. Queue Design (pgmq)

pgmq (`pgmq` 1.5.1) provides a lightweight message queue inside PostgreSQL. We use it for capacity-based task queuing.

### 5.1 Operations

| Operation | SQL | When |
|-----------|-----|------|
| Enqueue | `SELECT pgmq.send('mizpa-tasks', '{"task_id":"...","skill":"..."}')` | When MAX_VMS reached |
| Dequeue | `SELECT * FROM pgmq.read('mizpa-tasks', 30, 1)` | When VM frees up |
| Acknowledge | `SELECT pgmq.delete('mizpa-tasks', msg_id)` | After VM created successfully |
| Retry later | `SELECT pgmq.set_vt('mizpa-tasks', msg_id, 30)` | If still at capacity |
| Inspect | `SELECT * FROM pgmq.metrics('mizpa-tasks')` | Dashboard / monitoring |

### 5.2 Queue vs Direct DB Polling

| Aspect | pgmq | Polling `tasks` table |
|--------|------|----------------------|
| Atomic read + visibility | ✅ Built-in (`vt` parameter) | ❌ Need manual locking |
| Message ordering | ✅ FIFO per queue | ⚠️ ORDER BY + LIMIT |
| Retry logic | ✅ `set_vt()` | ❌ Manual |
| Monitoring | ✅ `metrics()` | ❌ Custom query |
| Complexity | Minimal | Moderate |
| **Veredict** | **✅ Selected** | |

---

## 6. Snapshot Strategy

### 6.1 Decision: Single Snapshot

**Chosen**: 1 unified snapshot (`mizpa-agent-v5`) with all tools.

**Rationale**:
- Node.js 24 + npm + Vite build deps = ~15GB / 16GB rootfs
- Custom tools (agent.sh, clone, generate, audit, deploy) = ~50KB total
- Splitting into 3 snapshots by skill still requires Node.js in each → no space savings
- Maintenance: 1 snapshot to update vs 3
- Boot time identical (<600ms) regardless of snapshot size

### 6.2 Snapshot Contents

```
/opt/mizpa/
├── agent.sh                  # Entrypoint: routes to skill handler
├── tools/
│   ├── clone_website.sh      # Website cloner (wget + html extraction)
│   ├── generate_project.js   # Full Vite+React+Tailwind project generator
│   ├── seo_geo_analyzer.py   # SEO/GEO scoring (Python stdlib)
│   ├── deploy_cloudflare.sh  # Cloudflare Pages deploy via Direct Upload API
│   └── snapshot-builder.sh   # One-time VM setup script
└── work/                     # Working directory (cleared per task)
```

### 6.3 VM Sizing

| Resource | Value | Notes |
|----------|-------|-------|
| vCPU | 4 | Adequate for npm build |
| RAM | 8GB | Required for Node.js build |
| Rootfs | 16GB | ~15GB used by Node/npm |
| Idle timeout | 900s | Safety net (VMs should be killed before this) |

---

## 7. Cleanup Strategy

### 7.1 Immediate Kill (Primary)

When `task-callback` completes:
1. Mark `task_results` and update `task` status
2. Mark `vm_sessions` as `deleted`
3. **DELETE the VM via freestyle API** ← immediate resource reclamation

### 7.2 Idle Timeout (Safety Net)

If callback never fires (VM crash, network failure), freestyle auto-suspends after `idleTimeoutSeconds` (900s). The `cleanup-vms` function then lists and deletes these.

### 7.3 Manual Cleanup

Dashboard "Limpiar VMs inactivas" button calls `cleanup-vms` in safe mode. Admin can use `{"force": true}` to nuke everything.

### 7.4 Cleanup Modes

| Mode | VMs with active tasks | VMs without tasks | Running tasks |
|------|----------------------|-------------------|---------------|
| `safe` | Preserved | Deleted | Not touched |
| `force` | Deleted | Deleted | Marked as failed |

---

## 8. Code Repository Strategy

### 8.1 Generated Sites

When a `generate` or `replica` task completes, the VM:
1. Pushes the generated code to a **GitHub repo** (per-site, under Naiam Studio org)
2. Deploys to Cloudflare Pages
3. Returns both URLs in the callback result

This ensures generated source code persists after VM termination.

### 8.2 Repository Structure

```
github.com/naiamstudio/mizpa-{sitename}/
├── index.html
├── src/
│   ├── App.tsx
│   ├── components/
│   └── styles/
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── dist/             (build output, pushed for Cloudflare)
```

---

## 9. Testing Strategy

### 9.1 E2E Test Structure

```
test/e2e/
├── helpers/
│   └── vm.ts              # VM lifecycle helpers for test assertions
├── specs/
│   ├── auth.spec.ts       # Login/logout flow
│   ├── dashboard.spec.ts  # Dashboard navigation
│   ├── playground.spec.ts # Task creation via chat
│   ├── task.spec.ts       # Task lifecycle (pending → running → completed)
│   └── vm-management.spec.ts  # VM limit, queuing, cleanup (NEW)
└── pages/                 # Page objects
```

### 9.2 VM Management Tests (planned in vm-management.spec.ts)

- Creating a task creates a VM (with capacity)
- Creating a task queues when at capacity
- Queued task runs when VM frees up
- cleanup-vms deletes idle VMs
- Force mode deletes all VMs

---

## 10. Security & Isolation

| Concern | Mitigation |
|---------|------------|
| VM data isolation | One VM per task, VM deleted after completion |
| Supabase RLS | Users see only their own tasks, results, and sessions |
| Callback validation | `task-callback` validates task ownership via `TASK_WEBHOOK_SECRET` |
| API keys | Only in Supabase secrets, never in frontend |
| Cloudflare deploy | Uses scoped API token with Pages write permission |

---

## 11. Migration Plan

### Phase 1: Foundation (this branch)
- ✅ Enable pgmq extension
- ✅ Create `mizpa-tasks` queue
- ✅ `cleanup-vms` Edge Function
- ✅ Dashboard cleanup button
- ⬜ Add `queued` to tasks status check
- ⬜ Update `create-task` with MAX_VMS check
- ⬜ Add `vm_sessions` tracking in `create-task`
- ⬜ Update `task-callback` with VM cleanup + queue trigger
- ⬜ Create `process-queue` Edge Function
- ⬜ Update E2E tests for VM management

### Phase 2: Code Persistence (future)
- ⬜ GitHub repo creation per site
- ⬜ Push generated code from VM
- ⬜ Store repo URL in task results

---

*Last updated: 2026-06-29*
