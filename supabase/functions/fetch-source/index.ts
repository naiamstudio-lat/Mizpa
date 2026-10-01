/**
 * fetch-source - guarded server-side retrieval of replication sources.
 *
 * The browser cannot do this itself: CORS blocks reading an arbitrary
 * replication target, so the agent's `fetch_url` tool calls this instead. That
 * makes this function an SSRF entry point, which is the reason it exists in
 * this shape and not as a bare proxy.
 *
 * Contract:
 *   POST { "url": "https://…" }
 *   200 { url, title, text, html, source, bytes, truncated }
 *   400 { error, code }  the destination was refused before any request left
 *   502 { error, code, status }  the upstream failed (its status is in `status`)
 *   504 { error, code }  no response inside the deadline
 *
 * `source` names which step of the precedence chain answered:
 * `llms.txt` -> `robots.txt` -> `html`. See `guard.ts` for the guard itself —
 * address classes, redirect re-validation, the 256 KiB budget and the fallback
 * rules all live there, testable without a runtime.
 *
 * No quota is consumed here. `fx_quota` is a model-token budget owned by
 * `fx-gateway` (design decision 2); charging source retrieval against it would
 * mean inventing a second cost unit inside the same ledger.
 *
 * Auth: unchanged from `run-agent` and `cleanup-vms` — the platform verifies the
 * caller's JWT, the function itself needs no service-role client and trusts no
 * request header.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { FetchError, GuardError, fetchSource } from './guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Deno's resolver, which the Supabase edge runtime does expose. The guard
 *  cannot see the addresses `fetch` will connect to, so DNS is the only place
 *  the SSRF decision can be made. */
const resolve = async (hostname: string): Promise<string[]> => {
  const [v4, v6] = await Promise.all([
    Deno.resolveDns(hostname, 'A').catch(() => [] as string[]),
    Deno.resolveDns(hostname, 'AAAA').catch(() => [] as string[]),
  ])
  return [...v4, ...v6]
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: { url?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body must be JSON', code: 'bad_request' }, 400)
  }

  const { url } = body
  if (typeof url !== 'string' || !url) {
    return json({ error: 'url is required', code: 'bad_request' }, 400)
  }

  try {
    const source = await fetchSource(url, { resolve, fetch: (input, init) => fetch(input, init) })
    console.log(`[fetch-source] ${source.source} <- ${source.url} (${source.bytes} bytes${source.truncated ? ', capped' : ''})`)
    return json(source)
  } catch (err) {
    if (err instanceof GuardError) {
      console.log(`[fetch-source] refused ${url}: ${err.code} — ${err.message}`)
      return json({ error: err.message, code: err.code }, 400)
    }
    if (err instanceof FetchError) {
      console.log(`[fetch-source] failed ${url}: ${err.code}`)
      return json({ error: err.message, code: err.code, status: err.status }, err.code === 'timeout' ? 504 : 502)
    }
    console.error('[fetch-source] Error:', err)
    return json({ error: String(err) }, 500)
  }
})