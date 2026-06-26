import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { skill, url } = await req.json()

    if (!skill || !url) {
      return new Response(
        JSON.stringify({ error: 'skill and url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['replica', 'audit', 'generate'].includes(skill)) {
      return new Response(
        JSON.stringify({ error: 'Invalid skill. Must be: replica, audit, or generate' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use service role for DB writes
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Create task record
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert({
        user_id: user.id,
        skill,
        url,
        status: 'pending',
      })
      .select()
      .single()

    if (taskError) {
      console.error('Task creation error:', taskError)
      return new Response(
        JSON.stringify({ error: 'Failed to create task' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // TODO: Create Freestyle VM and configure agent
    // For now, return task ID and simulate VM creation
    console.log(`Task created: ${task.id} | Skill: ${skill} | URL: ${url}`)

    // In production, this would:
    // 1. Create a Freestyle VM from snapshot
    // 2. Install/configure agent for the specific skill
    // 3. Create identity + token for client access
    // 4. Store vm_id and vm_token in the task record
    // 5. Start the agent execution

    // Simulate VM creation delay
    await new Promise(resolve => setTimeout(resolve, 100))

    // Update task with simulated VM info
    const simulatedVmId = `vm-${task.id.slice(0, 8)}`
    const { error: updateError } = await supabaseAdmin
      .from('tasks')
      .update({
        vm_id: simulatedVmId,
        status: 'running',
      })
      .eq('id', task.id)

    if (updateError) {
      console.error('Task update error:', updateError)
    }

    return new Response(
      JSON.stringify({
        taskId: task.id,
        vmId: simulatedVmId,
        status: 'running',
        message: 'Task created and VM provisioning started',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
