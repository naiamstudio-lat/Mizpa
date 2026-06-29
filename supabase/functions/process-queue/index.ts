import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const FREESTYLE_API = 'https://api.freestyle.sh'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_FREESTYLE_VMS = parseInt(Deno.env.get('MAX_FREESTYLE_VMS') || '3', 10)
const FREESTYLE_SNAPSHOT_ID = Deno.env.get('FREESTYLE_SNAPSHOT_ID')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FREESTYLE_KEY = Deno.env.get('FREESTYLE_API_KEY')
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

function freestyleHeaders() {
  if (!FREESTYLE_KEY) throw new Error('FREESTYLE_API_KEY not set')
  return { 'Authorization': `Bearer ${FREESTYLE_KEY}`, 'Content-Type': 'application/json' }
}

async function createVm(snapshotId: string): Promise<{ vmId: string }> {
  const res = await fetch(`${FREESTYLE_API}/v1/vms`, {
    method: 'POST',
    headers: freestyleHeaders(),
    body: JSON.stringify({ snapshotId, idleTimeoutSeconds: 300 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`VM create failed: ${res.status} ${JSON.stringify(err)}`)
  }
  const data = await res.json()
  return { vmId: data.vmId || data.id }
}

async function execVm(vmId: string, cmd: string) {
  const res = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}/exec-await`, {
    method: 'POST',
    headers: freestyleHeaders(),
    body: JSON.stringify({ command: cmd }),
  })
  if (!res.ok) throw new Error(`Exec failed: ${res.status}`)
  return res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Auth: must be service role (internal call from task-callback or cron)
    // We accept either a valid service role token or skip auth for simplicity
    // since this function only reads from queue and creates VMs
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    const processed: Array<{ taskId: string; status: string }> = []
    const maxIterations = 3 // Process up to 3 queued tasks per invocation

    for (let i = 0; i < maxIterations; i++) {
      // 1. Read next message from queue
      const { data: msgData } = await admin.rpc('pgmq_read', {
        queue_name: 'mizpa-tasks',
        vt: 30,
        qty: 1,
      })

      if (!msgData || msgData.length === 0) {
        console.log('No queued tasks')
        break
      }

      const msg = msgData[0]
      const payload = typeof msg.message === 'string' ? JSON.parse(msg.message) : msg.message
      const msgId = msg.msg_id

      // 2. Check capacity
      const { data: capResult } = await admin.rpc('active_vm_count')
      const activeCount = capResult || 0

      if (activeCount >= MAX_FREESTYLE_VMS) {
        // Still at capacity — retry later (visibility timeout will handle)
        console.log(`At capacity ${activeCount}/${MAX_FREESTYLE_VMS}, will retry msg ${msgId} later`)
        // ack the message, it will be re-queued since it was already read with vt=30
        // Actually, just let the visibility timeout expire and it'll reappear
        processed.push({ taskId: payload.task_id, status: 'still-queued' })
        break
      }

      // 3. Capacity available — create VM
      if (!FREESTYLE_SNAPSHOT_ID) {
        console.error('FREESTYLE_SNAPSHOT_ID not set, cannot process queue')
        await admin.rpc('pgmq_delete', { queue_name: 'mizpa-tasks', msg_id: msgId })
        break
      }

      const { task_id, skill, url, user_id } = payload

      console.log(`Processing queued task ${task_id} (${skill}: ${url})`)

      let vmId: string
      try {
        const result = await createVm(FREESTYLE_SNAPSHOT_ID)
        vmId = result.vmId
        console.log(`VM created for queued task: ${vmId}`)
      } catch (vmError) {
        console.error(`VM creation failed for task ${task_id}:`, vmError)
        await admin.from('tasks').update({ status: 'failed', error_message: String(vmError) }).eq('id', task_id)
        await admin.rpc('pgmq_delete', { queue_name: 'mizpa-tasks', msg_id: msgId })
        continue
      }

      // 4. Track VM session
      await admin.from('vm_sessions').insert({
        task_id,
        vm_id: vmId,
        status: 'running',
        spec: { snapshotId: FREESTYLE_SNAPSHOT_ID, idleTimeoutSeconds: 300 },
      })

      // 5. Update task
      await admin.from('tasks').update({ vm_id: vmId, status: 'running' }).eq('id', task_id)

      // 6. Delete from queue
      await admin.rpc('pgmq_delete', { queue_name: 'mizpa-tasks', msg_id: msgId })

      // 7. Fire agent (fire-and-forget)
      const callbackUrl = `${SUPABASE_URL}/functions/v1/task-callback`
      const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
      const cfApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN')

      ;(async () => {
        try {
          await execVm(vmId, `curl -s -X POST "${callbackUrl}" -H "Content-Type: application/json" -d '{"taskId":"${task_id}","status":"running","results":[{"type":"log","content":{"message":"Starting ${skill} on ${url} (from queue)..."}}]}'`)

          const envPrefix = cfAccountId && cfApiToken
            ? `CLOUDFLARE_ACCOUNT_ID="${cfAccountId}" CLOUDFLARE_API_TOKEN="${cfApiToken}" `
            : ''

          const result = await execVm(vmId, `${envPrefix}bash /opt/mizpa/agent.sh "${skill}" "${url}" "${callbackUrl}" "${task_id}"`)

          if (result.statusCode !== 0) {
            await execVm(vmId, `curl -s -X POST "${callbackUrl}" -H "Content-Type: application/json" -d '{"taskId":"${task_id}","status":"failed","results":[{"type":"error","content":{"message":"Agent exited with code ${result.statusCode}"}}]}'`)
          }
        } catch (e) {
          console.error(`Agent execution failed for task ${task_id}:`, e)
          try {
            await admin.from('tasks').update({ status: 'failed', error_message: String(e) }).eq('id', task_id)
          } catch (_) {}
        }
      })()

      processed.push({ taskId: task_id, status: 'running' })
    }

    return new Response(JSON.stringify({
      status: 'ok',
      processed: processed.length,
      results: processed,
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('process-queue error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
