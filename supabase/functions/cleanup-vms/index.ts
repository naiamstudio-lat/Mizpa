import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const FREESTYLE_API = 'https://api.freestyle.sh'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FreestyleVm {
  id: string
  state: string
  createdAt: string
  lastNetworkActivity: string | null
  cpuTimeSeconds: number
}

function headers(): Record<string, string> {
  const key = Deno.env.get('FREESTYLE_API_KEY')
  if (!key) throw new Error('FREESTYLE_API_KEY not set')
  return { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function listVms(): Promise<FreestyleVm[]> {
  const res = await fetch(`${FREESTYLE_API}/v1/vms`, { headers: headers() })
  if (!res.ok) throw new Error(`List VMs failed: ${res.status}`)
  const data = await res.json()
  return data.vms || []
}

async function deleteVm(vmId: string): Promise<boolean> {
  try {
    const res = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}`, { method: 'DELETE', headers: headers() })
    return res.ok
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Auth — any logged-in user can trigger cleanup
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Create admin client with service role for full DB access
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // 1. Fetch all VMs from freestyle
    const allVms = await listVms()
    const totalCount = allVms.length

    // 2. Parse request body for options
    let force = false
    try {
      const body = await req.json()
      force = body.force === true
    } catch { /* no body — normal mode */ }

    // 3. Get active VM IDs from our DB (VMs with running tasks)
    const activeVmIds = new Set<string>()

    if (!force) {
      const { data: activeSessions } = await admin
        .from('vm_sessions')
        .select('vm_id')
        .in('status', ['creating', 'running', 'stopping'])

      const { data: activeTasks } = await admin
        .from('tasks')
        .select('vm_id')
        .in('status', ['running', 'pending'])
        .not('vm_id', 'is', null)

      for (const s of activeSessions || []) if (s.vm_id) activeVmIds.add(s.vm_id)
      for (const t of activeTasks || []) if (t.vm_id) activeVmIds.add(t.vm_id)
    }

    // 4. Delete VMs
    const deleted: string[] = []
    const skipped: string[] = []
    const errors: { id: string; error: string }[] = []

    for (const vm of allVms) {
      if (activeVmIds.has(vm.id)) {
        skipped.push(vm.id)
        continue
      }
      const ok = await deleteVm(vm.id)
      if (ok) {
        deleted.push(vm.id)
      } else {
        errors.push({ id: vm.id, error: 'Delete failed' })
      }
    }

    // 5. Update DB
    if (deleted.length > 0) {
      // Mark vm_sessions as deleted
      await admin
        .from('vm_sessions')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .in('vm_id', deleted)
    }

    if (force && deleted.length > 0) {
      // Mark any running/pending tasks as failed
      await admin
        .from('tasks')
        .update({ status: 'failed', error_message: 'VM cleaned up by force', updated_at: new Date().toISOString() })
        .not('vm_id', 'is', null)
    }

    const report = {
      status: 'ok',
      mode: force ? 'force' : 'safe',
      totalVms: totalCount,
      deleted: deleted.length,
      skipped: skipped.length,
      errors: errors.length,
      details: {
        activeVmIds: [...activeVmIds],
        deletedVmIds: deleted,
        skippedVmIds: skipped,
        errors,
      },
      message: force
        ? `Force-cleaned ${deleted.length} VMs. All tasks with VMs marked as failed.`
        : `Cleaned up ${deleted.length} idle VMs. ${skipped.length} active VMs preserved.`,
    }

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
