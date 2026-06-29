import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { createVm } from "./freestyle.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_FREESTYLE_VMS = parseInt(Deno.env.get('MAX_FREESTYLE_VMS') || '3', 10)
const FREESTYLE_SNAPSHOT_ID = Deno.env.get('FREESTYLE_SNAPSHOT_ID')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { skill, url } = await req.json()

    if (!skill || !url) {
      return new Response(JSON.stringify({ error: 'skill and url are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!['replica', 'audit', 'generate'].includes(skill)) {
      return new Response(JSON.stringify({ error: 'Invalid skill. Must be: replica, audit, or generate' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Admin client for DB operations
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Helper: fire agent on VM (fire-and-forget)
    const runAgent = async (vmId: string, vm: any, taskId: string) => {
      try {
        const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/task-callback`
        const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
        const cfApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN')

        await vm.exec(`curl -s -X POST "${callbackUrl}" -H "Content-Type: application/json" -d '{"taskId":"${taskId}","status":"running","results":[{"type":"log","content":{"message":"Starting ${skill} on ${url}..."}}]}'`)

        const envPrefix = cfAccountId && cfApiToken
          ? `CLOUDFLARE_ACCOUNT_ID="${cfAccountId}" CLOUDFLARE_API_TOKEN="${cfApiToken}" `
          : ''

        const agentCmd = `${envPrefix}bash /opt/mizpa/agent.sh "${skill}" "${url}" "${callbackUrl}" "${taskId}"`

        const execResult = await vm.exec(agentCmd)
        console.log(`Agent exec: ${execResult.stdout?.slice(0, 200) || ''}`)
        if (execResult.stderr) console.error(`Agent stderr: ${execResult.stderr?.slice(0, 200)}`)

        // Safety net: if agent failed without calling callback
        if (execResult.statusCode !== 0) {
          await vm.exec(`curl -s -X POST "${callbackUrl}" -H "Content-Type: application/json" -d '{"taskId":"${taskId}","status":"failed","results":[{"type":"error","content":{"message":"Agent exited with code ${execResult.statusCode}"}}]}'`)
        }
      } catch (bgError) {
        console.error('Background execution failed:', bgError)
        try {
          await admin.from('tasks').update({ status: 'failed', error_message: String(bgError) }).eq('id', taskId)
        } catch (_) {}
      }
    }

    // ========================
    // 1. Create task record
    // ========================
    const { data: task, error: taskError } = await admin
      .from('tasks')
      .insert({ user_id: user.id, skill, url, status: 'pending' })
      .select()
      .single()

    if (taskError) {
      console.error('Task creation error:', taskError)
      return new Response(JSON.stringify({ error: 'Failed to create task' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Task created: ${task.id} | Skill: ${skill} | URL: ${url}`)

    // ========================
    // 2. Audit: inline (no VM)
    // ========================
    if (skill === 'audit') {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'MizpaBot/1.0' },
          signal: AbortSignal.timeout(10000),
        })
        const html = await response.text()

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

        const geo = 50 + (hasSchema ? 25 : 0) + (hasOG ? 25 : 0)
        const overall = Math.round((seo + geo) / 2)

        const issues: Array<{ severity: string; message: string }> = []
        if (!title) issues.push({ severity: 'critical', message: 'Missing title tag' })
        if (!description) issues.push({ severity: 'critical', message: 'Missing meta description' })
        if (h1Count === 0) issues.push({ severity: 'warning', message: 'No H1 tag found' })
        if (!hasOG) issues.push({ severity: 'warning', message: 'Missing Open Graph tags' })
        if (!hasSchema) issues.push({ severity: 'warning', message: 'No structured data (JSON-LD)' })

        const result = {
          url, title, description, h1Count, h2Count, imgCount, imgWithAlt,
          hasViewport, hasCharset, hasOpenGraph: hasOG, hasSchema,
          scores: { overall, seo, geo, performance: 75 }, issues,
        }

        await admin.from('task_results').insert({
          task_id: task.id, result_type: 'audit', content: result,
        })

        await admin.from('tasks').update({
          status: 'completed', completed_at: new Date().toISOString(),
        }).eq('id', task.id)

        console.log(`Audit completed: overall=${overall}, seo=${seo}, geo=${geo}`)

        return new Response(JSON.stringify({ taskId: task.id, status: 'completed', result }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (auditError) {
        console.error('Audit failed:', auditError)
        await admin.from('tasks').update({ status: 'failed', error_message: String(auditError) }).eq('id', task.id)
        return new Response(JSON.stringify({ error: 'Audit failed', details: String(auditError) }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // ===================================================
    // 3. Replica / Generate: need VM (or queue if at cap)
    // ===================================================
    if (!FREESTYLE_SNAPSHOT_ID) {
      console.warn('No FREESTYLE_SNAPSHOT_ID — running inline fallback')
      const msg = 'Snapshot not configured — run snapshot-builder.sh first'
      await admin.from('task_results').insert({ task_id: task.id, result_type: skill, content: { url, status: 'skipped', message: msg } })
      await admin.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id)
      return new Response(JSON.stringify({ taskId: task.id, status: 'completed', result: { url, message: msg } }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check capacity
    const { data: capResult } = await admin.rpc('active_vm_count')
    const activeCount = capResult || 0
    console.log(`Active VMs: ${activeCount}/${MAX_FREESTYLE_VMS}`)

    if (activeCount >= MAX_FREESTYLE_VMS) {
      // No capacity — queue via pgmq
      await admin.from('tasks').update({ status: 'queued' }).eq('id', task.id)
      await admin.rpc('pgmq_send', {
        queue_name: 'mizpa-tasks',
        msg: JSON.stringify({ task_id: task.id, skill, url, user_id: user.id }),
      })

      console.log(`Task ${task.id} queued (${activeCount}/${MAX_FREESTYLE_VMS} active)`)

      return new Response(JSON.stringify({
        taskId: task.id,
        status: 'queued',
        message: `Task queued. ${activeCount}/${MAX_FREESTYLE_VMS} VMs active.`,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Capacity available — create VM
    let vmId: string
    let vm: any
    try {
      const result = await createVm({ snapshotId: FREESTYLE_SNAPSHOT_ID, idleTimeoutSeconds: 900 })
      vmId = result.vmId
      vm = result.vm
      console.log(`VM created: ${vmId}`)
    } catch (vmError) {
      console.error('VM creation failed:', vmError)
      await admin.from('tasks').update({ status: 'failed', error_message: String(vmError) }).eq('id', task.id)
      return new Response(JSON.stringify({ error: 'Failed to create VM', details: String(vmError) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Track VM session
    await admin.from('vm_sessions').insert({
      task_id: task.id,
      vm_id: vmId,
      status: 'running',
      spec: { snapshotId: FREESTYLE_SNAPSHOT_ID, idleTimeoutSeconds: 900 },
    })

    // Update task
    await admin.from('tasks').update({ vm_id: vmId, status: 'running' }).eq('id', task.id)

    // Fire agent (async, don't await)
    runAgent(vmId, vm, task.id).catch(e => console.error('runAgent failed:', e))

    const cfStatus = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') && Deno.env.get('CLOUDFLARE_API_TOKEN')
      ? 'SET' : 'MISSING'

    return new Response(JSON.stringify({
      taskId: task.id,
      vmId,
      status: 'running',
      cfStatus,
      message: `Task running on VM (${activeCount + 1}/${MAX_FREESTYLE_VMS} active)`,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
