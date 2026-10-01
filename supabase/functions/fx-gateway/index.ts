/**
 * fx-gateway - server-side proxy for the AI Gateway, and the quota accounting
 * that pays for it.
 *
 * Why it exists: `libfx` runs in the tab, so anything it needs to authenticate
 * against a model is, by construction, readable by the user running the tab. The
 * only way to keep a provider key out of the bundle is to keep the request out
 * of the browser too — the agent's `fetch` override (obs #10) rewrites every
 * gateway URL to this function and passes the route as `?path=`.
 *
 * Contract:
 *   GET  /                      the bootstrap document (see below)
 *   {GET,POST} /?path=/v{n}/ai/language-model
 *   200/4xx/5xx  the upstream's own status and body, plus x-fx-* headers
 *   400 { error, code: 'missing_path' | 'invalid_body' }   the call is malformed
 *   401 { error, code: 'unauthenticated' }    no usable user JWT
 *   403 { error, code: 'path_not_allowed' }   off the allow-list, upstream untouched
 *   403 { error, code: 'quota_exhausted' }    no budget, upstream untouched
 *   500 { error, code }                       server misconfiguration
 *   502 { error, code: 'quota_unavailable' }  the ledger could not be charged
 *   502 { error, code: 'upstream_error' } | 504 'upstream_timeout'
 *
 *   GET /
 *   200 { model, provider, gateway: { baseUrl, protocolVersion, modelHeader },
 *         quota: { used, limit, remaining }, unitsCharged }
 *   401 as above   403 as above   500 as above
 *
 * Four invariants, and the order of the code is what enforces them:
 *   1. The real key is added here and nowhere else. `buildUpstreamRequest`
 *      cannot read the incoming request, so no client header — placeholder key,
 *      session cookie — can reach the gateway.
 *   2. The **model belongs to this function**. `ai-language-model-id` is the only
 *      channel it travels on, and `reconcileRequestBody` deletes the model's
 *      `model` key from the body so the two cannot compete. The tab is not left
 *      believing it chose: every response carries `x-fx-model`/`x-fx-provider`,
 *      and `GET /` states it before the first call.
 *   3. A reservation is charged *before* the upstream is contacted, which is what
 *      makes the 403 honest: on a denial nothing has left the isolate.
 *   4. The reservation is reconciled against the model's reported token usage
 *      afterwards. A crash in between leaves the reservation as the cost —
 *      bounded, and bounded in the direction that cannot leak spend.
 *
 * Auth: the caller's JWT is verified against GoTrue, and the user id it yields
 * is the *only* source of `p_user_id`. That matters more here than anywhere
 * else in the codebase: the RPC takes the user id as a parameter and is granted
 * to the service role alone precisely because it is not trustworthy as input.
 *
 * Conventions match `fetch-source` and the older functions — same `corsHeaders`,
 * same OPTIONS short-circuit, same `json()` helper and `[fx-gateway]` log prefix.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  BOOTSTRAP_COST_UNITS,
  DEFAULT_DAILY_UNITS,
  EXPOSE_HEADERS,
  ProxyError,
  TokenUsage,
  assertProxyPath,
  buildBootstrapPayload,
  buildBrowserHeaders,
  buildGatewayResponse,
  buildUpstreamRequest,
  createUsageScanner,
  planSettlement,
  providerOf,
  quotaDenied,
  reconcileRequestBody,
  reserveUnitsFor,
  resolveGatewayBaseUrl,
} from './proxy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // Without this the browser refuses to hand `x-fx-*` to JavaScript at all, and
  // the model the function actually ran stays invisible to the UI meant to show
  // it. A header nobody may read is not transparency.
  'Access-Control-Expose-Headers': EXPOSE_HEADERS,
}

const QUOTA_WINDOW = '24:00:00'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const env = (name: string): string => Deno.env.get(name) ?? ''

/**
 * This function's public URL — the base the tab must build proxied URLs against.
 * Never the gateway origin, which has no credential behind it from a browser.
 *
 * `FX_GATEWAY_PUBLIC_URL` first: the runtime strips this function's path before
 * the worker sees the request, so `req.url` is the bare origin and deriving the
 * base from it hands out a URL the tab cannot call. See `resolveGatewayBaseUrl`.
 */
function selfUrl(req: Request): string {
  return resolveGatewayBaseUrl(env('FX_GATEWAY_PUBLIC_URL'), new URL(req.url).origin)
}

/**
 * Verify the caller's JWT and return its user id.
 *
 * The `apikey` sent alongside is only routing metadata for Kong — GoTrue
 * authorizes `/auth/v1/user` from the Authorization header, so the publishable
 * key confers nothing. Both names are read because Supabase renamed anon to
 * publishable: a deployment that provisions one must not 500 the other.
 */
async function authenticate(req: Request): Promise<string> {
  const header = req.headers.get('authorization') ?? ''
  const jwt = /^Bearer\s+(\S+)$/.exec(header)?.[1]
  if (!jwt) throw new ProxyError('unauthenticated', 'a user bearer token is required', 401)

  const url = env('SUPABASE_URL')
  const publishable = env('SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_ANON_KEY')
  if (!url || !publishable) {
    throw new ProxyError('auth_not_configured', 'SUPABASE_URL / publishable key are not set', 500)
  }

  const verifier = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await verifier.auth.getUser(jwt)
  if (error || !data?.user?.id) {
    throw new ProxyError('unauthenticated', `token rejected: ${error?.message ?? 'no user'}`, 401)
  }
  return data.user.id
}

/** Charge the caller's budget. Never throws; the caller maps the outcome. */
async function charge(userId: string, units: number): Promise<number> {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.rpc('fx_consume_quota', {
    p_user_id: userId,
    p_cost: units,
    p_window: QUOTA_WINDOW,
    p_default_limit: DEFAULT_DAILY_UNITS,
  })
  if (error) throw new ProxyError('quota_unavailable', error.message, 502)
  return Number(data)
}

/**
 * Reconcile a reservation against what the model actually consumed.
 *
 * Best-effort by construction, and deliberately so: this runs after the response
 * has been handed back, so an isolate evicted mid-generation loses the
 * settlement and the reservation stands. That failure is a bounded over-charge
 * on one call. The alternative — refusing to serve anything that cannot be
 * settled exactly — would mean buffering every streaming generation, which is a
 * far worse trade. Errors are logged and swallowed for the same reason: a failed
 * settlement must not turn a delivered answer into an error page.
 */
async function settle(userId: string, reserved: number, usage: TokenUsage | null): Promise<void> {
  const plan = planSettlement(reserved, usage)
  if (!plan.settles) {
    console.warn(
      `[fx-gateway] no usage reported; holding the reservation of ${reserved} for ${userId}`,
    )
    return
  }
  try {
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await admin.rpc('fx_settle_quota', {
      p_user_id: userId,
      p_reserved: reserved,
      p_actual: plan.actual,
      p_window: QUOTA_WINDOW,
    })
    if (error) throw new Error(error.message)
    console.log(
      `[fx-gateway] settled ${reserved} -> ${plan.actual} (${plan.refund >= 0 ? 'refund' : 'overrun'} ${Math.abs(plan.refund)})`,
    )
  } catch (err) {
    console.error(`[fx-gateway] settlement failed; holding ${reserved}: ${String(err)}`)
  }
}

/** Read a copy of the relayed stream looking for the usage block. Drains to the
 *  end regardless of what the tab does with its own branch, which is what makes
 *  a client disconnect cheaper rather than more expensive. */
async function readUsage(
  stream: ReadableStream<Uint8Array>,
  scanner: ReturnType<typeof createUsageScanner>,
): Promise<TokenUsage | null> {
  const decoder = new TextDecoder()
  let found: TokenUsage | null = null
  const reader = stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      found = scanner.push(decoder.decode(value, { stream: true })) ?? found
    }
    // A multi-byte character can straddle chunks; flush the decoder before the
    // scanner's own end-of-stream, or a truncated tail silently becomes invalid.
    const tail = decoder.decode()
    if (tail !== '') found = scanner.push(tail) ?? found
  } finally {
    reader.releaseLock()
  }
  return found ?? scanner.end()
}

/**
 * The bootstrap document: `{ model, provider, gateway base URL, protocol
 * version, quota remaining }`.
 *
 * The tab needs all of it *before* its first agent call, because the agent's
 * `fetch` override has to know where to send a rewritten gateway URL and the UI
 * has to know which model to name. Without this the tab would have to guess, or
 * the first call would be the thing that discovers the configuration.
 *
 * Three properties, all deliberate:
 *   - **Authenticated.** Same GoTrue check as a proxied call, and the user id
 *     again comes only from the verified token. An unauthenticated caller gets
 *     401 and no configuration at all.
 *   - **Not free.** It goes through `fx_consume_quota` for one token. A route
 *     that reports a budget without charging it is an unauthenticated meter
 *     with no ceiling, and the prompt is explicit that this must not be a hole.
 *     One token is small enough to be invisible and large enough to be a real
 *     charge: an exhausted caller is refused here too.
 *   - **No credential.** The payload carries the model id, the provider prefix
 *     and this function's own URL. Never the gateway origin — the tab has no
 *     credential for it — and never anything from `AI_GATEWAY_API_KEY`.
 */
async function bootstrap(req: Request): Promise<Response> {
  const userId = await authenticate(req)
  const used = await charge(userId, BOOTSTRAP_COST_UNITS)

  if (quotaDenied(used)) {
    console.warn(`[fx-gateway] quota exhausted for ${userId}; refused bootstrap`)
    return json({
      error: `fx quota exhausted: the next ${BOOTSTRAP_COST_UNITS} unit(s) exceed your remaining budget`,
      code: 'quota_exhausted',
      cost: BOOTSTRAP_COST_UNITS,
      limit: DEFAULT_DAILY_UNITS,
    }, 403)
  }

  const model = env('AI_GATEWAY_MODEL_ID')
  const payload = buildBootstrapPayload({
    model,
    gatewayBaseUrl: selfUrl(req),
    used,
    limit: DEFAULT_DAILY_UNITS,
    unitsCharged: BOOTSTRAP_COST_UNITS,
  })
  console.log(`[fx-gateway] bootstrap for ${userId}: ${payload.model} via ${payload.provider} (used ${used})`)
  return json(payload)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  const method = req.method

  try {
    // A bare `GET /` is the bootstrap document, so it is dispatched before the
    // allow-list — which would otherwise read it as a missing `?path=` and
    // answer 400, leaving the tab with no way to configure its first call.
    if (method === 'GET' && path === null) return await bootstrap(req)

    // Validate before spending anything: a refused call costs no quota.
    const upstreamPath = assertProxyPath(method, path)
    // Read the body before charging too, so a truncated request cannot be
    // billed for an answer it never gets to ask for. Reconciling it here is also
    // what lets the server's model be the only one the gateway can see.
    const raw = method === 'GET' ? null : await req.text()
    const reconciled = raw === null
      ? null
      : reconcileRequestBody(raw, env('AI_GATEWAY_MODEL_ID'))

    const userId = await authenticate(req)
    const reserved = reserveUnitsFor(method)
    const used = await charge(userId, reserved)

    if (quotaDenied(used)) {
      console.warn(`[fx-gateway] quota exhausted for ${userId}; refused ${method} ${upstreamPath}`)
      return json({
        error: `fx quota exhausted: the next ${reserved} unit(s) exceed your remaining budget`,
        code: 'quota_exhausted',
        cost: reserved,
        limit: DEFAULT_DAILY_UNITS,
      }, 403)
    }

    const target = buildUpstreamRequest({
      method,
      path: upstreamPath,
      body: reconciled?.body ?? null,
      apiKey: env('AI_GATEWAY_API_KEY'),
      modelId: reconciled?.model ?? env('AI_GATEWAY_MODEL_ID'),
    })

    let upstream: Response
    try {
      upstream = await fetch(target.url, {
        method,
        headers: target.headers,
        body: target.body ?? undefined,
        redirect: target.redirect,
        signal: target.signal,
      })
    } catch (err) {
      const name = (err as { name?: string } | null)?.name
      const timedOut = name === 'AbortError' || name === 'TimeoutError'
      console.error(`[fx-gateway] ${method} ${upstreamPath} failed: ${String(err)}`)
      return json(
        { error: timedOut ? 'the gateway did not answer in time' : 'the gateway is unreachable',
          code: timedOut ? 'upstream_timeout' : 'upstream_error' },
        timedOut ? 504 : 502,
      )
    }

    // The tab is told what actually ran, before it reads a single byte of the
    // answer. `x-fx-units` is the reservation, not the settled figure: this
    // header is written before the upstream finishes, and the settled number
    // lands in the ledger. A tab that needs the exact figure re-reads `GET /`.
    const headers = buildBrowserHeaders(buildGatewayResponse(upstream).headers, {
      model: target.headers['ai-language-model-id'] ?? '',
      provider: providerOf(target.headers['ai-language-model-id'] ?? ''),
      gatewayBaseUrl: selfUrl(req),
      units: reserved,
      remaining: Math.max(0, DEFAULT_DAILY_UNITS - used),
      apiKey: env('AI_GATEWAY_API_KEY'),
    })

    if (upstream.body === null) {
      console.log(`[fx-gateway] ${method} ${upstreamPath} -> ${upstream.status} (reserved ${reserved} of ${used})`)
      return new Response(null, { status: upstream.status, headers: { ...corsHeaders, ...headers } })
    }

    // Relayed by reference, and read by a second branch: a streaming completion
    // must not be buffered to find out what it cost. `tee()` keeps draining our
    // copy even if the tab disconnects, so a client hang-up does not turn into a
    // lost settlement.
    const [toTab, toUs] = upstream.body.tee()
    const contentType = upstream.headers.get('content-type') ?? ''
    const scanner = createUsageScanner(contentType.includes('text/event-stream') ? 'sse' : 'json')
    void readUsage(toUs, scanner)
      .then((usage) => settle(userId, reserved, usage))
      .catch((err) => {
        console.error(`[fx-gateway] usage read failed; holding ${reserved}: ${String(err)}`)
      })

    console.log(`[fx-gateway] ${method} ${upstreamPath} -> ${upstream.status} (reserved ${reserved} of ${used})`)
    return new Response(toTab, { status: upstream.status, headers: { ...corsHeaders, ...headers } })
  } catch (err) {
    if (err instanceof ProxyError) {
      console.log(`[fx-gateway] refused: ${err.code} — ${err.message}`)
      return json({ error: err.message, code: err.code }, err.status)
    }
    console.error('[fx-gateway] Error:', err)
    return json({ error: String(err) }, 500)
  }
})