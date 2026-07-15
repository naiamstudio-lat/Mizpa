import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const FREESTYLE_API = 'https://api.freestyle.sh'
const FREESTYLE_KEY = Deno.env.get('FREESTYLE_API_KEY')

async function deleteVm(vmId: string) {
  const res = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${FREESTYLE_KEY}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Delete VM failed: ${res.status}`)
  return res.json()
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Verify webhook secret (production only)
    if (Deno.env.get('DENO_ENV') === 'production') {
      const webhookSecret = req.headers.get('x-webhook-secret')
      const expected = Deno.env.get('TASK_WEBHOOK_SECRET')
      if (expected && webhookSecret !== expected) {
        return new Response(JSON.stringify({ error: 'Invalid webhook secret' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    const { taskId, status, results, error: errorMsg } = await req.json()

    if (!taskId || !status) {
      return new Response(JSON.stringify({ error: 'taskId and status are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get task info (need vm_id for freestyle delete)
    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('vm_id')
      .eq('id', taskId)
      .single()

    // Update task status
    const updateData: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (status === 'completed' || status === 'failed') updateData.completed_at = new Date().toISOString()
    if (errorMsg) updateData.error_message = errorMsg

    const { error: taskError } = await supabaseAdmin.from('tasks').update(updateData).eq('id', taskId)
    if (taskError) {
      console.error('Task update error:', taskError)
      return new Response(JSON.stringify({ error: 'Failed to update task' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Store results
    if (results && Array.isArray(results)) {
      for (const result of results) {
        const { error: resultError } = await supabaseAdmin
          .from('task_results')
          .insert({ task_id: taskId, result_type: result.type || 'log', content: result.content || {} })
        if (resultError) console.error('Result insert error:', resultError)
      }
    }

    // Cleanup: mark vm_sessions as deleted + delete VM + trigger queue
    if (status === 'completed' || status === 'failed') {
      // Mark session as deleted
      await supabaseAdmin
        .from('vm_sessions')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('task_id', taskId)

      // Delete VM from freestyle (fire-and-forget)
      const vmId = task?.vm_id
      if (vmId) {
        ;(async () => {
          try {
            await deleteVm(vmId)
            console.log(`VM ${vmId} deleted`)
          } catch (e) {
            console.error(`Failed to delete VM ${vmId}:`, e)
          }
        })()
      }

      // Trigger process-queue (fire-and-forget)
      ;(async () => {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/process-queue`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            },
          })
          console.log('process-queue triggered')
        } catch (e) {
          console.error('Failed to trigger process-queue:', e)
        }
      })()
    }

    console.log(`Task ${taskId} updated to status: ${status}`)

    return new Response(JSON.stringify({ success: true, taskId, status }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Callback error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
