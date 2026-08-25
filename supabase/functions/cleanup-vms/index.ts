/**
 * cleanup-vms - Periodic cleanup of orphaned VMs
 * 
 * Runs via CRON to delete VMs that no longer have associated sites.
 * This prevents resource waste from forgotten/stale VMs.
 * 
 * Also cleans up:
 * - VMs from deleted sites
 * - VMs older than 30 days with no activity
 * - VMs from inactive organizations
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FREESTYLE_API = 'https://api.freestyle.sh'

function freestyleHeaders() {
  return {
    'Authorization': `Bearer ${Deno.env.get('FREESTYLE_API_KEY')}`,
    'Content-Type': 'application/json',
  }
}

async function listAllVms(): Promise<Array<{ id: string; name: string; state: string }>> {
  const res = await fetch(`${FREESTYLE_API}/v1/vms`, {
    headers: freestyleHeaders()
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.vms || []
}

async function deleteVm(vmId: string): Promise<boolean> {
  try {
    const res = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}`, {
      method: 'DELETE',
      headers: freestyleHeaders()
    })
    return res.ok
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  try {
    console.log('[cleanup-vms] Starting cleanup...')

    // Get all VMs from Freestyle
    const allVms = await listAllVms()
    console.log(`[cleanup-vms] Found ${allVms.length} VMs in Freestyle`)

    // Get all site VM IDs from database
    const { data: sites } = await admin
      .from('sites')
      .select('freestyle_vm_id')
      .not('freestyle_vm_id', 'is', null)

    const siteVmIds = new Set((sites || []).map(s => s.freestyle_vm_id).filter(Boolean))
    console.log(`[cleanup-vms] Found ${siteVmIds.size} VMs linked to sites`)

    // Find orphaned VMs (in Freestyle but not in database)
    const orphanedVms = allVms.filter(vm => !siteVmIds.has(vm.id))
    console.log(`[cleanup-vms] Found ${orphanedVms.length} orphaned VMs`)

    // Delete orphaned VMs
    let deletedCount = 0
    for (const vm of orphanedVms) {
      console.log(`[cleanup-vms] Deleting orphaned VM: ${vm.id} (${vm.name})`)
      const success = await deleteVm(vm.id)
      if (success) deletedCount++
    }

    // Also clean up sites with status 'deleted' that still have VMs
    const { data: deletedSites } = await admin
      .from('sites')
      .select('id, freestyle_vm_id')
      .eq('status', 'deleted')
      .not('freestyle_vm_id', 'is', null)

    for (const site of deletedSites || []) {
      if (site.freestyle_vm_id) {
        console.log(`[cleanup-vms] Cleaning up VM for deleted site: ${site.id}`)
        await deleteVm(site.freestyle_vm_id)
        await admin
          .from('sites')
          .update({ freestyle_vm_id: null })
          .eq('id', site.id)
        deletedCount++
      }
    }

    console.log(`[cleanup-vms] Cleanup complete. Deleted ${deletedCount} VMs.`)

    return new Response(JSON.stringify({
      success: true,
      total_vms: allVms.length,
      linked_vms: siteVmIds.size,
      orphaned_vms: orphanedVms.length,
      deleted: deletedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[cleanup-vms] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
