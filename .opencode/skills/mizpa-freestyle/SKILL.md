---
name: mizpa-freestyle
description: "Trigger: freestyle, VM, snapshot, agent, pipeline, cleanup, queue, exec. Freestyle.sh VM management and agent pipeline for Mizpa."
license: Apache-2.0
metadata:
  author: naiamstudio
  version: "1.0"
---

## Activation Contract

Use when working with freestyle.sh VMs, snapshots, agent execution, or the task pipeline in Mizpa.

## Hard Rules

- VM operations require `FREESTYLE_API_KEY` env var.
- Snapshot ID is in `FREESTYLE_SNAPSHOT_ID` env var.
- Max concurrent VMs: `MAX_FREESTYLE_VMS` (default: 3).
- Agent runs on VM via `bash /opt/mizpa/agent.sh` — never modify directly.
- Callback URL is `SUPABASE_URL/functions/v1/task-callback`.

## Architecture

```
User → Playground → create-task Edge Function
                    ↓
                    ├─ Audit: inline (no VM)
                    └─ Replica/Generate: 
                         ├─ Check capacity (active_vm_count)
                         ├─ If at capacity → queue (pgmq)
                         └─ If available → create VM → run agent
                              ↓
                              Agent calls task-callback when done
                              ↓
                              process-queue picks up queued tasks
```

## VM Lifecycle

**Create:**
```typescript
import { createVm } from "./freestyle.ts";
const result = await createVm({ 
  snapshotId: FREESTYLE_SNAPSHOT_ID, 
  idleTimeoutSeconds: 900 
});
```

**Execute on VM:**
```typescript
const execResult = await vm.exec(`curl -s -X POST "${callbackUrl}" ...`);
// Returns: { stdout, stderr, statusCode }
```

**Cleanup:**
```typescript
import { deleteVm } from "./freestyle.ts";
await deleteVm(vmId);
```

## Agent Execution Flow

1. VM created from snapshot (pre-installed tools)
2. Agent script runs: `bash /opt/mizpa/agent.sh "${skill}" "${url}" "${callbackUrl}" "${taskId}"`
3. Agent calls callback with status updates
4. Task status updates in database
5. VM idle timeout → auto-cleanup

## Queue System (pgmq)

When at capacity:
1. Task status → `queued`
2. Message sent to `mizpa-tasks` queue
3. `process-queue` Edge Function reads queue
4. Creates VM when capacity available
5. Deletes message from queue

**Queue Operations:**
```sql
-- Read next message
SELECT * FROM pgmq_read('mizpa-tasks', vt => 30, qty => 1);

-- Delete processed message
SELECT pgmq_delete('mizpa-tasks', msg_id);
```

## Freestyle REST API

Base URL: `https://api.freestyle.sh`

**Headers:**
```typescript
{
  'Authorization': `Bearer ${FREESTYLE_API_KEY}`,
  'Content-Type': 'application/json'
}
```

**Endpoints:**
- `POST /v1/vms` — Create VM
- `GET /v1/vms` — List VMs
- `DELETE /v1/vms/{vmId}` — Delete VM
- `POST /v1/vms/{vmId}/exec-await` — Execute command
- `POST /v1/vms/{vmId}/stop` — Stop VM

## Callback Protocol

Agent reports status via POST to callback URL:
```json
{
  "taskId": "uuid",
  "status": "running|completed|failed",
  "results": [
    {
      "type": "audit|replica|frontend|log|error",
      "content": { "message": "...", "data": {} }
    }
  ]
}
```

## Gotchas

- VM `idleTimeoutSeconds` = 900 (15 min) for main tasks, 300 (5 min) for queued.
- `exec-await` blocks until command completes — don't use for long-running commands.
- Agent script is at `/opt/mizpa/agent.sh` on the VM — part of snapshot.
- Cloudflare credentials passed as env vars to agent: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.
- Queue uses visibility timeout (vt=30) — message reappears if not deleted.

## Validation

Before modifying pipeline:
1. Check VM capacity logic in `create-task/index.ts`.
2. Verify callback URL is correct.
3. Test with `process-queue` Edge Function.
4. Monitor `vm_sessions` table for stuck VMs.
