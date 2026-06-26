import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Service role for full access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify webhook secret (production only)
    if (Deno.env.get('DENO_ENV') === 'production') {
      const webhookSecret = req.headers.get('x-webhook-secret')
      const expected = Deno.env.get('TASK_WEBHOOK_SECRET')
      if (expected && webhookSecret !== expected) {
        return new Response(
          JSON.stringify({ error: 'Invalid webhook secret' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const { taskId, status, results, error: errorMsg } = await req.json()

    if (!taskId || !status) {
      return new Response(
        JSON.stringify({ error: 'taskId and status are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update task status
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString()
    }

    if (errorMsg) {
      updateData.error_message = errorMsg
    }

    const { error: taskError } = await supabaseAdmin
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)

    if (taskError) {
      console.error('Task update error:', taskError)
      return new Response(
        JSON.stringify({ error: 'Failed to update task' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store results if provided
    if (results && Array.isArray(results)) {
      for (const result of results) {
        const { error: resultError } = await supabaseAdmin
          .from('task_results')
          .insert({
            task_id: taskId,
            result_type: result.type || 'log',
            content: result.content || {},
          })

        if (resultError) {
          console.error('Result insert error:', resultError)
        }
      }
    }

    // If completed, clean up VM session record
    if (status === 'completed' || status === 'failed') {
      await supabaseAdmin
        .from('vm_sessions')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('task_id', taskId)
        .eq('status', 'running')
    }

    console.log(`Task ${taskId} updated to status: ${status}`)

    return new Response(
      JSON.stringify({ success: true, taskId, status }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Callback error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
