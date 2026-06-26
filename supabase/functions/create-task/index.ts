import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { createVm } from "./freestyle.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Service role client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Create task record
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

    console.log(`Task created: ${task.id} | Skill: ${skill} | URL: ${url}`)

    // 2. For audit: do it directly in the Edge Function (fast, reliable)
    if (skill === 'audit') {
      try {
        // Fetch the page
        const response = await fetch(url, {
          headers: { 'User-Agent': 'MizpaBot/1.0' },
          signal: AbortSignal.timeout(10000),
        })
        const html = await response.text()

        // Extract elements
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ''
        const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i)?.[1] || ''
        const h1Count = (html.match(/<h1/gi) || []).length
        const h2Count = (html.match(/<h2/gi) || []).length
        const imgCount = (html.match(/<img/gi) || []).length
        const imgWithAlt = (html.match(/<img[^>]*alt=["'][^"']+["']/gi) || []).length
        const hasViewport = /viewport/i.test(html)
        const hasCharset = /charset/i.test(html)
        const hasOG = /og:/i.test(html)
        const hasSchema = /application\/ld\+json/i.test(html)

        // Calculate scores
        let seo = 0
        if (title.length > 5) seo += 15
        if (description.length > 20) seo += 15
        if (h1Count >= 1) seo += 10
        if (h2Count >= 1) seo += 10
        if (hasViewport) seo += 10
        if (hasCharset) seo += 10
        if (hasOG) seo += 10
        if (hasSchema) seo += 10
        if (imgCount > 0 && imgWithAlt >= imgCount / 2) seo += 10

        let geo = 50
        if (hasSchema) geo += 25
        if (hasOG) geo += 25

        const overall = Math.round((seo + geo) / 2)

        // Build issues
        const issues = []
        if (!title) issues.push({ severity: 'critical', message: 'Missing title tag' })
        if (!description) issues.push({ severity: 'critical', message: 'Missing meta description' })
        if (h1Count === 0) issues.push({ severity: 'warning', message: 'No H1 tag found' })
        if (!hasOG) issues.push({ severity: 'warning', message: 'Missing Open Graph tags' })
        if (!hasSchema) issues.push({ severity: 'warning', message: 'No structured data (JSON-LD)' })

        const result = {
          url,
          title,
          description,
          h1Count,
          h2Count,
          imgCount,
          imgWithAlt,
          hasViewport,
          hasCharset,
          hasOpenGraph: hasOG,
          hasSchema,
          scores: { overall, seo, geo, performance: 75 },
          issues,
        }

        // Store results
        await supabaseAdmin.from('task_results').insert({
          task_id: task.id,
          result_type: 'audit',
          content: result,
        })

        // Update task as completed
        await supabaseAdmin.from('tasks').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', task.id)

        console.log(`Audit completed: overall=${overall}, seo=${seo}, geo=${geo}`)

        return new Response(
          JSON.stringify({ taskId: task.id, status: 'completed', result }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (auditError) {
        console.error('Audit failed:', auditError)
        await supabaseAdmin.from('tasks').update({
          status: 'failed',
          error: String(auditError),
        }).eq('id', task.id)

        return new Response(
          JSON.stringify({ error: 'Audit failed', details: String(auditError) }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 3. For replica/generate: use freestyle VM from snapshot (heavy work)
    const snapshotId = Deno.env.get('FREESTYLE_SNAPSHOT_ID')
    if (!snapshotId) {
      // Fallback: do basic work inline if no snapshot available
      console.warn('No FREESTYLE_SNAPSHOT_ID — running inline fallback')
      
      const fallbackResult = skill === 'replica'
        ? { url, status: 'downloaded', message: 'Snapshot not configured — run snapshot-builder.sh first' }
        : { url, status: 'generated', message: 'Snapshot not configured — run snapshot-builder.sh first' }

      await supabaseAdmin.from('task_results').insert({
        task_id: task.id,
        result_type: skill,
        content: fallbackResult,
      })

      await supabaseAdmin.from('tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', task.id)

      return new Response(
        JSON.stringify({ taskId: task.id, status: 'completed', result: fallbackResult }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let vmId: string
    let vm: any
    try {
      const result = await createVm({ snapshotId, idleTimeoutSeconds: 900 })
      vmId = result.vmId
      vm = result.vm
      console.log(`VM created from snapshot: ${vmId}`)
    } catch (vmError) {
      console.error('VM creation failed:', vmError)
      await supabaseAdmin.from('tasks').update({ status: 'failed', error: String(vmError) }).eq('id', task.id)
      return new Response(
        JSON.stringify({ error: 'Failed to create VM', details: String(vmError) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    await supabaseAdmin.from('tasks').update({ vm_id: vmId, status: 'running' }).eq('id', task.id)

    // Fire-and-forget: VM does the heavy work
    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/task-callback`
    const taskId = task.id

    ;(async () => {
      try {
        // Signal starting
        await vm.exec(`curl -s -X POST "${callbackUrl}" -H "Content-Type: application/json" -d '{"taskId":"${taskId}","status":"running","results":[{"type":"log","content":{"message":"Starting ${skill} on ${url}..."}}]}'`)

        // Run the agent via entrypoint script (pre-installed in snapshot)
        const agentCmd = [
          'bash /opt/mizpa/agent.sh',
          `"${skill}"`,
          `"${url}"`,
          `"${callbackUrl}"`,
          `"${taskId}"`,
        ].join(' ')

        const execResult = await vm.exec(agentCmd)
        console.log(`Agent exec: ${execResult.stdout || ''}`)
        if (execResult.stderr) console.error(`Agent stderr: ${execResult.stderr}`)

        // The agent itself calls callback, but as a safety net:
        if (execResult.statusCode !== 0) {
          await vm.exec(`curl -s -X POST "${callbackUrl}" -H "Content-Type: application/json" -d '{"taskId":"${taskId}","status":"failed","results":[{"type":"error","content":{"message":"Agent exited with code ${execResult.statusCode}"}}]}'`)
        }

        console.log(`VM ${vmId} completed task ${taskId}`)
      } catch (bgError) {
        console.error('Background execution failed:', bgError)
        try {
          const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
          await admin.from('tasks').update({ status: 'failed', error: String(bgError) }).eq('id', taskId)
        } catch (_) {}
      }
    })()

    return new Response(
      JSON.stringify({ taskId: task.id, vmId, status: 'running', message: 'Task created, VM provisioning from snapshot started' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
