/**
 * fx-gateway proxy policy — the whole decision surface, with no runtime deps.
 *
 * Split from `index.ts` on the same reasoning as `fetch-source`: the parts worth
 * being sure of are pure functions, so the anti-leak control and the allow-list
 * are provable in milliseconds without a Deno runtime, a network or a database.
 *
 * This function exists for one reason (spec capability `ai-gateway-proxy`): the
 * AI Gateway key must never reach the browser, and every call must be charged
 * to a real user's budget before the upstream is contacted. Three consequences
 * shape everything below:
 *
 *   1. The upstream header set is **built**, never forwarded. It is a closed set
 *      of four names, listed in `UPSTREAM_HEADER_NAMES` and asserted as such.
 *      That is the anti-leak control: there is no code path that copies a value
 *      out of the incoming request, so the tab's placeholder key, its session
 *      cookie and its own idea of the model cannot travel upstream.
 *   2. The **model is server policy**. The body can never choose it — see
 *      `reconcileRequestBody` — and a caller-supplied `?model=` is accepted only
 *      if it names a model in the catalogue this function publishes. See "who
 *      owns the model" below and `models.ts`.
 *   3. The cost is the model's **token usage**, so the charge before the call
 *      can only be a reservation. See "the reservation and the settlement".
 */

import {
  DEFAULT_MODEL_ID,
  ModelDescriptor,
  TIER_RESERVATION_RATES,
  listCatalog,
  resolveModel,
} from './models.ts'

export const GATEWAY_ORIGIN = 'https://ai-gateway.vercel.sh'

/** Design: 30 s. A model completion is slower than the document fetch U3 gave
 *  10 s, and cutting a generation short would break the product rather than
 *  protect it. The browser is waiting on this, so the budget is the user's
 *  patience, not a network hygiene number. */
export const UPSTREAM_TIMEOUT_MS = 30_000

/**
 * How long a relayed stream may go without a chunk before it is force-closed.
 *
 * Deliberately **separate from `UPSTREAM_TIMEOUT_MS`**, and that separation is
 * the entire point. The absolute deadline bounds the request; this bounds the
 * *silence*. They fail differently: a model that streams tokens for 29 s and then
 * stops mid-sentence has satisfied the absolute deadline and would otherwise hold
 * the tab open until the isolate dies — with the reservation still charged and
 * nothing settled. The gateway is an aggregator, so some upstream model will
 * eventually fail to emit a terminal event; AnythingLLM found this only after
 * shipping an aggregator, and this is their mechanism read rather than
 * rediscovered.
 *
 * 15 s is longer than any normal gap between chunks and shorter than a user will
 * wait, so a genuinely stalled generation is closed while the tab still thinks
 * the request is alive.
 */
export const STREAM_IDLE_TIMEOUT_MS = 15_000

/**
 * The clock and timers the watchdog runs on, injected rather than reached for.
 *
 * This exists so the behaviour is observable without spending real seconds: a
 * caller can supply a fake `now` and a fake interval and drive an idle timeout to
 * completion deterministically. Without it, proving the watchdog fires means
 * either a 15 s test or trusting a code read.
 */
export interface WatchdogClock {
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
  now(): number
}

/** The real clock. Indirection only — no behaviour lives here. */
export const SYSTEM_CLOCK: WatchdogClock = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as number),
  now: () => Date.now(),
}

export interface IdleGuardOptions {
  idleMs?: number
  /** How often the silence is measured. Defaults to half of `idleMs`, so there is
   *  always at least one check before the deadline can be reached. */
  pollMs?: number
  clock?: WatchdogClock
  /** Called once, when the guard trips. For logging — never for control flow. */
  onIdle?: () => void
}

export interface IdleGuard {
  /** The stream to hand the tab, in place of the raw upstream body. */
  readonly stream: ReadableStream<Uint8Array>
  /** Did the guard force-close? True only after it did. A force-close ends the
   *  stream *without* a terminal `finish` part, which the v4 protocol defines as
   *  truncation — so the tab can tell this apart from a completed generation. */
  readonly tripped: boolean
  /**
   * Disarm and drop the upstream. Idempotent, and safe to call from any path.
   *
   * The interval is cleared on *every* exit — normal end, upstream error, client
   * disconnect, trip, or this call — because a leaked interval holds a Deno
   * isolate open. An isolate kept alive by a stray `setInterval` bills wall-clock
   * time for a request that already finished.
   */
  stop(): void
}

/**
 * Wrap a relayed stream so silence ends it.
 *
 * The mechanism is a `setInterval` comparing the clock against the time of the
 * last chunk, force-closing once the gap exceeds the threshold. Arming happens in
 * `start`, which runs when the stream is constructed — so the deadline counts from
 * the moment the response exists, not from the first byte, and a body that never
 * emits anything at all is caught too.
 */
export function guardStreamIdle(
  source: ReadableStream<Uint8Array>,
  options: IdleGuardOptions = {},
): IdleGuard {
  const idleMs = options.idleMs ?? STREAM_IDLE_TIMEOUT_MS
  const pollMs = Math.max(1, options.pollMs ?? Math.floor(idleMs / 2))
  const clock = options.clock ?? SYSTEM_CLOCK
  const reader = source.getReader()

  let handle: unknown = null
  let lastChunkAt = clock.now()
  let tripped = false

  const disarm = (): void => {
    if (handle === null) return
    clock.clearInterval(handle)
    handle = null
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      lastChunkAt = clock.now()
      handle = clock.setInterval(() => {
        if (clock.now() - lastChunkAt < idleMs) return
        if (tripped) return
        tripped = true
        disarm()
        options.onIdle?.()
        // Two closes, and both matter. Cancelling the upstream stops the provider
        // billing for tokens nobody will read, and — because cancelling one branch
        // of a `tee()` leaves the source alive — it is also what lets `readUsage`
        // return, which is what settles the reservation. Closing the tab's branch
        // is what actually ends the request.
        //
        // `close()` and **not** `error()`, which is the opposite of the obvious
        // choice and was measured rather than assumed. Verified against a real
        // `supabase/edge-runtime` with a function that returns one chunk and then
        // either closes, errors or stalls: `close()` ends the client's read in
        // 0.53 s, while `error()` and a stall are indistinguishable to the client
        // and both hang until the client gives up. An errored response body is
        // swallowed by the runtime, so force-closing with `error()` would have
        // looked correct in a unit test and in the logs — the interval really did
        // clear — while leaving the tab hanging, which is the whole failure this
        // watchdog exists to prevent.
        //
        // Closing is also not ambiguous on the wire. The v4 streaming protocol
        // terminates with a `finish` part carrying `usage`; a stream that ends
        // without one is truncated *by definition*, which is precisely what
        // happened here. And the money consequence is already correct either way:
        // no `finish` means no usage, so `extractUsage` returns null and the
        // reservation stands — the ledger never records a partial generation as a
        // complete one.
        void reader.cancel(new Error('idle')).catch(() => {})
        try {
          controller.close()
        } catch {
          // Already closed or errored upstream. Nothing left to end.
        }
      }, pollMs)
    },
    async pull(controller) {
      if (tripped) return
      try {
        const { done, value } = await reader.read()
        if (done) {
          disarm()
          controller.close()
          return
        }
        lastChunkAt = clock.now()
        controller.enqueue(value)
      } catch (err) {
        disarm()
        controller.error(err)
      }
    },
    cancel(reason) {
      // The tab hung up. Disarm before cancelling the upstream, or the interval
      // outlives the request it was watching.
      disarm()
      return reader.cancel(reason)
    },
  })

  return {
    stream,
    get tripped() {
      return tripped
    },
    stop() {
      disarm()
      void reader.cancel(new Error('stopped')).catch(() => {})
    },
  }
}

/**
 * What one proxied call reserves before the upstream is contacted, and what the
 * ledger is finally held to.
 *
 * **One quota unit is one token.** The product owner owns this decision: spend
 * is accounted by what the model actually consumed, not by a flat per-call
 * number, which is a fairness budget rather than a spend forecast.
 *
 * The charge before the call therefore cannot be exact — the token count does
 * not exist until the answer is back — so it is a *reservation*, and the real
 * number settles the difference afterwards. The reservation cannot be derived
 * from the body either, because the caller writes the body: a reservation sized
 * by the caller's own `prompt` or `maxOutputTokens` is a budget the tab chose.
 * `RESERVATION_UNITS` is therefore a server constant, and it is generous enough
 * that an ordinary agent turn is never refused mid-flight.
 *
 * Not gamed: the reservation is fixed, charged before the upstream, and refunded
 * only against usage the upstream itself reported.
 */
export const UNITS_PER_TOKEN = 1

/**
 * The standard tier's reservation rate, re-exported so this file keeps exactly one
 * named cost constant for the common case.
 *
 * The *owner* of that number moved to `models.ts` with the tier table it belongs
 * to, because a tier's rate is a property of the tier and duplicating it here
 * would be two sources of truth for money. What changed is not the size — 200k is
 * still what a standard call holds — it is that the rate is now chosen per model
 * rather than applied to every call.
 */
export const RESERVATION_UNITS = TIER_RESERVATION_RATES.standard

/** A model catalogue is not a generation. U4 charged it the same flat unit, so
 *  a listing could be the call that locked a user out; one token keeps it behind
 *  the same ledger without making it cost a fifth of a turn. */
export const MODELS_LIST_COST_UNITS = 1

/** Reading the bootstrap document is one token. The prompt is explicit that it
 *  must not be a quota-free hole: a route that reports a user's budget without
 *  touching the budget is an unauthenticated meter, so it goes through the same
 *  RPC and is refused the same way. */
export const BOOTSTRAP_COST_UNITS = 1

/** Per-user budget per rolling window, in the same units. 20M tokens a day is
 *  roughly a hundred agent turns — generous for interactive use, and it still
 *  terminates a runaway loop. Passed explicitly on every RPC call so the cost
 *  model has exactly one owner — this file. */
export const DEFAULT_DAILY_UNITS = 20_000_000

/**
 * What a request reserves.
 *
 * A `GET` is a catalogue listing rather than a generation, so it keeps its flat
 * token. Everything else reserves **one minute of the resolved model's own tier
 * rate** — see `TIER_RESERVATION_RATES` in `models.ts`. The descriptor is a
 * required argument and not an optional one on purpose: an optional descriptor
 * would have to degrade to *some* rate when absent, and that default is precisely
 * the silent mis-bill this refactor exists to remove. The type makes it
 * impossible to forget, and `ModelDescriptor` cannot be built without a rate —
 * `assertDescriptor` refuses a catalogue row that lacks one.
 *
 * An unrecognised method is charged as a generation: the allow-list has already
 * refused anything else, so reaching here with an odd method is a bug, and failing
 * toward spending is the safe direction for a bug in a money path.
 */
export function reserveUnitsFor(method: string, descriptor: ModelDescriptor): number {
  return method === 'GET' ? MODELS_LIST_COST_UNITS : descriptor.quotaRateTokensPerMin
}

// --- which model runs --------------------------------------------------------
//
// Ownership nuance, and it is a real change rather than a detail: previously the
// tab chose nothing and the server always ran `AI_GATEWAY_MODEL_ID`. Now the tab
// may *name* a model, out of band, as `?model=`. What has not changed is who
// decides: the catalogue is server policy, so a caller can only pick among models
// this product publishes, and anything else is a 400 before a single unit is
// charged. The tab still cannot inject an id the catalogue does not contain, which
// was the entire point of stripping `model` from the body.

export interface ModelSelection {
  descriptor: ModelDescriptor
  /** `requested` when the caller named a catalogue model, `default` otherwise. */
  source: 'requested' | 'default'
}

/**
 * Resolve the model for a call.
 *
 * Two failure directions, deliberately different answers:
 *   - a **caller** naming something we do not offer is a hard 400
 *     (`UnknownModelError`), thrown before authentication and before any charge;
 *   - the **server's own** configured model being absent from the catalogue is a
 *     500. That is a misconfiguration, not user error, and reporting it as a 400
 *     would blame the caller for a bad deploy. It also fails closed: the constant
 *     is never used to *invent* a rate for a model that is not in the table.
 *
 * `requested` arrives as a raw query parameter, so it can be anything at all. An
 * empty or whitespace-only value is treated as "not named" rather than as an
 * unknown id, because `?model=` is what a URL builder produces when the tab has
 * nothing selected yet, and refusing it would be a confusing 400 for a normal
 * state.
 */
export function selectModel(requested: string | null, configured: string): ModelSelection {
  const named = requested === null ? '' : requested.trim()

  if (named === '') {
    const fallback = configured.trim() !== '' ? configured.trim() : DEFAULT_MODEL_ID
    try {
      return { descriptor: resolveModel(fallback), source: 'default' }
    } catch {
      throw new ProxyError(
        'unknown_model',
        `AI_GATEWAY_MODEL_ID is '${fallback}', which is not in the fx model catalogue`,
        500,
      )
    }
  }

  return { descriptor: resolveModel(named), source: 'requested' }
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface SettlementPlan {
  /** What the pre-flight charge took. */
  reserved: number
  /** Real usage-derived cost, or `null` when the upstream never reported any. */
  actual: number | null
  /** `false` means the ledger is left holding the reservation. That is the
   *  crash window: an isolate that dies between reserve and settle, a stream
   *  abandoned mid-generation, a usage block this function cannot parse. */
  settles: boolean
  /** What the ledger ends up holding under this plan. */
  heldUnits: number
  /** Units to give back. Negative on an overrun, which is a debit. */
  refund: number
}

/** Turn a reservation plus whatever usage came back into a settlement. Pure, so
 *  the failure mode is an assertion rather than an incident: with no usage the
 *  plan does not settle and the reservation stands. */
export function planSettlement(reserved: number, usage: TokenUsage | null): SettlementPlan {
  if (usage === null) {
    return { reserved, actual: null, settles: false, heldUnits: reserved, refund: 0 }
  }
  const actual = Math.max(0, Math.round(usage.totalTokens * UNITS_PER_TOKEN))
  return { reserved, actual, settles: true, heldUnits: actual, refund: reserved - actual }
}

/**
 * The only header names the upstream may ever see. Nothing else is constructible.
 *
 * `ai-gateway-protocol-version` is load-bearing, not decoration. Verified against
 * the live gateway: `/v1`, `/v3` and `/v4` all answer 400 "Unsupported gateway
 * protocol version" without it, and the failure arrives *before* auth, so it is
 * invisible to any test that only exercises credential paths. Adding it moves the
 * failure to a body-schema error, which is how we know the route is live.
 * `/v5` answers 404 with `x-matched-path: /404` — not a real route — which is why
 * the allow-list stays version-agnostic rather than being widened to `/v5`.
 */
export const UPSTREAM_HEADER_NAMES = [
  'authorization',
  'ai-gateway-protocol-version',
  'ai-language-model-id',
  'content-type',
] as const

/** The model travels in this header and nowhere else. */
export const MODEL_HEADER = 'ai-language-model-id'

/**
 * How the tab *names* a model to this function.
 *
 * A query parameter rather than a header or a body field, and the choice is
 * deliberate: the body is the one caller-supplied channel we already had to strip
 * `model` from, and a request header would be a caller-supplied header — the exact
 * thing `buildUpstreamRequest` is built so that cannot reach the gateway. Keeping
 * the selection on the URL leaves the property intact: the tab names a model, this
 * function decides which one actually runs, and the header is written from that
 * decision rather than from the request.
 */
export const MODEL_QUERY_PARAM = 'model'

/** Value for `ai-gateway-protocol-version`. Vercel AI Gateway's current protocol
 *  version; the SDKs send the same constant. */
export const GATEWAY_PROTOCOL_VERSION = '0.0.1'

/** What the tab may read back off a proxied response. `content-type` is the
 *  whole list on purpose: an upstream `set-cookie` or `x-vercel-id` has no
 *  business in a response the tab will parse. */
const RESPONSE_HEADER_NAMES = ['content-type'] as const

/**
 * The public URL the tab must build proxied URLs against.
 *
 * Configuration first, and that ordering is not a preference. Verified against a
 * real `supabase/edge-runtime`: the worker is invoked with its own path already
 * stripped, so `req.url` inside the function is `http://host:9111/` — deriving
 * the base from the request yields an address with no function segment, and the
 * tab would construct a URL it cannot call. The function genuinely cannot know
 * its own public address, so `FX_GATEWAY_PUBLIC_URL` is the source of truth and
 * the request URL is only a fallback for a function served from the root.
 *
 * Always stripped of trailing slashes: the tab concatenates `?path=` onto this,
 * and a trailing slash would put the route on the wrong segment.
 */
export function resolveGatewayBaseUrl(configured: string, requestUrl: string): string {
  const base = configured !== '' ? configured : requestUrl
  return base.replace(/\/+$/, '')
}

export class ProxyError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
    this.name = 'ProxyError'
  }
}

// --- the allow-list ---------------------------------------------------------

/**
 * Version-agnostic on purpose. libfx 0.0.12 calls `/v4/ai/language-model` while
 * its own README documents `/v3`, so a literal path silently 403s every user the
 * day the SDK moves. `$` is not `m`-flagged, so a trailing newline does not
 * satisfy it, and the anchors reject traversal, protocol-relative and absolute
 * forms for free.
 */
const ROUTES: ReadonlyArray<{ method: string; re: RegExp }> = [
  { method: 'GET', re: /^\/coding-agent\/v\d+\/models$/ },
  { method: 'POST', re: /^\/v\d+\/ai\/language-model$/ },
]

/** Return the path to proxy, or refuse. 400 means the call is malformed;
 *  403 is the spec's "host denied" answer and never reaches the upstream. */
export function assertProxyPath(method: string, raw: unknown): string {
  if (typeof raw !== 'string' || raw === '') {
    throw new ProxyError('missing_path', 'fx-gateway requires ?path=', 400)
  }
  if (!ROUTES.some((r) => r.method === method && r.re.test(raw))) {
    throw new ProxyError('path_not_allowed', `${method} ${raw} is not proxied by fx-gateway`, 403)
  }
  return raw
}

// --- header reconstruction --------------------------------------------------

export interface UpstreamRequestSpec {
  method: string
  path: string
  body: string | null
  apiKey: string
  modelId: string
  /** Only overridden by tests, so an armed deadline can be observed without
   *  spending the real 30 s. */
  timeoutMs?: number
}

export interface UpstreamRequest {
  url: string
  headers: Record<string, string>
  /** The exact bytes to forward. Carried here so the invariant "what the caller
   *  wrote is not what the upstream receives" is provable at the policy layer
   *  rather than in the wiring. */
  body: string | null
  redirect: 'error'
  signal: AbortSignal
}

/**
 * Build the upstream request from scratch.
 *
 * Note what is absent: this function cannot see the incoming request, so no
 * caller-supplied header can reach the gateway even by mistake. The body is the
 * one caller-supplied thing that does cross, and only after `reconcileRequestBody`
 * has removed the model from it.
 */
export function buildUpstreamRequest(spec: UpstreamRequestSpec): UpstreamRequest {
  if (!spec.apiKey) throw new ProxyError('missing_api_key', 'AI_GATEWAY_API_KEY is not set', 500)
  if (!spec.modelId) throw new ProxyError('missing_model_id', 'AI_GATEWAY_MODEL_ID is not set', 500)

  const headers: Record<string, string> = {
    authorization: `Bearer ${spec.apiKey}`,
    'ai-gateway-protocol-version': GATEWAY_PROTOCOL_VERSION,
    [MODEL_HEADER]: spec.modelId,
  }
  if (spec.method !== 'GET') headers['content-type'] = 'application/json'

  return {
    url: `${GATEWAY_ORIGIN}${spec.path}`,
    headers,
    body: spec.method === 'GET' ? null : spec.body,
    redirect: 'error',
    // Armed, not merely present: an inert controller signal would leave the
    // worker waiting on a slow-loris for as long as the platform allows.
    signal: AbortSignal.timeout(spec.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
  }
}

export interface GatewayResponse {
  status: number
  headers: Record<string, string>
  body: ReadableStream<Uint8Array> | null
}

/** Pass the upstream status and body through; rebuild the headers. The body is
 *  handed over by reference so a streaming completion is relayed, not buffered
 *  — buffering it would put the whole generation inside the deadline and behind
 *  a memory wall. */
export function buildGatewayResponse(upstream: Response): GatewayResponse {
  const headers: Record<string, string> = {}
  for (const name of RESPONSE_HEADER_NAMES) {
    const value = upstream.headers.get(name)
    if (value !== null) headers[name] = value
  }
  return { status: upstream.status, headers, body: upstream.body }
}

// --- quota ------------------------------------------------------------------

/**
 * The RPC's denial signal is a 0 `used` total; anything that is not a positive
 * number is treated as a denial too. An ambiguous result must not open the gate,
 * so this fails closed.
 */
export function quotaDenied(result: unknown): boolean {
  return !(typeof result === 'number' && Number.isFinite(result) && result > 0)
}

// --- who owns the model ------------------------------------------------------
// The product owner's decision, replacing the design's rejected alternative:
// the function owns the model and the tab is *told* which one ran, rather than
// the tab believing it chose and the server silently deciding otherwise.
//
// Which channel is authoritative is not a preference — it follows from the
// protocol. `/v{4}/ai/language-model` serves Language Model Specification v4
// (AI SDK 7), and `LanguageModelV4CallOptions` has **no `model` field**: the
// model is out-of-band, carried by the `ai-language-model-id` header. So the
// header is authoritative because it is the only channel the wire format
// defines, and the body's `model` is *removed* rather than left to be ignored —
// one channel means there is nothing left to disagree with, now or after a
// gateway version starts honouring a field it currently drops.
//
// The tab may now *name* a model, on `?model=`, and the distinction that keeps
// this from being a contradiction is worth stating plainly: naming is not
// choosing. The set of names that can be named is the catalogue in `models.ts`,
// which is server policy — a caller cannot reach an id this function does not
// publish, so the header is still written from a server-side decision. What
// changed is the size of that set, from one to the catalogue, and the price is
// that the catalog's rate table is now load-bearing for money.

export interface RequestReconciliation {
  /** The exact bytes to forward. */
  body: string
  /** What the caller asked for, kept only so it can be reported. `null` when
   *  the body carried no string model. */
  requestedModel: string | null
  /** The model that will actually run: the server's. */
  model: string
  /** Did the caller's body agree with it? Reported, never enforced. */
  modelMatchesRequest: boolean
  modelWasOverridden: boolean
}

/**
 * Remove the model from a request body and pin the one that will run.
 *
 * Every `model` key goes, matching or not. A rule that only fired on a mismatch
 * would have to define "match", and a tab that agrees today will disagree the
 * day the server swaps models — which is exactly when the behaviour needs to be
 * boring.
 */
export function reconcileRequestBody(raw: string, serverModelId: string): RequestReconciliation {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ProxyError('invalid_body', 'the request body must be JSON the proxy can read', 400)
  }
  // An array is an object in JS but not a call options bag; `null` is not one
  // either. Both are refused rather than forwarded, because the proxy now has to
  // be able to read the body to honour the ownership invariant.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ProxyError('invalid_body', 'the request body must be a JSON object', 400)
  }

  const source = parsed as Record<string, unknown>
  const requested = typeof source['model'] === 'string' ? (source['model'] as string) : null
  const forwarded: Record<string, unknown> = { ...source }
  delete forwarded['model']

  return {
    body: JSON.stringify(forwarded),
    requestedModel: requested,
    model: serverModelId,
    modelMatchesRequest: requested === serverModelId,
    modelWasOverridden: requested !== null && requested !== serverModelId,
  }
}

/** The provider is the prefix of the model id the *server* chose, so it is not
 *  caller-influenced. A malformed id reports `unknown` rather than a plausible-
 *  looking provider, because a wrong provider label in the UI is worse than an
 *  obviously absent one. Note this is the *requested* provider: the gateway
 *  routes and may fail over server-side, and the id it reports back is relayed
 *  in the response body for anyone who needs the resolved one. */
export function providerOf(modelId: string): string {
  const slash = modelId.indexOf('/')
  if (slash <= 0 || slash === modelId.length - 1) return 'unknown'
  return modelId.slice(0, slash)
}

// --- reading the model's token usage -----------------------------------------
// Field path verified against the wire format, not guessed. `/v4/ai/language-model`
// is Language Model Specification v4 (AI SDK 7); `LanguageModelV4Usage` from
// `@ai-sdk/provider` is:
//
//   { inputTokens: { total, noCache, cacheRead, cacheWrite },
//     outputTokens: { total, text, reasoning }, raw? }
//
// It arrives in two places, and both are handled:
//   - non-streaming (`doGenerate`): the top-level `usage`, a sibling of `content`.
//   - streaming (`doStream`): the terminal `{ "type": "finish", "usage": … }` part.

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Pull token usage out of a decoded payload. Returns `null` — never zero — for
 * anything it cannot read, because `null` keeps the reservation standing while a
 * fabricated `0` hands out free generations to anyone able to shape a response.
 */
export function extractUsage(payload: unknown): TokenUsage | null {
  if (typeof payload !== 'object' || payload === null) return null
  const usage = (payload as Record<string, unknown>)['usage']
  if (typeof usage !== 'object' || usage === null) return null
  const u = usage as Record<string, unknown>

  // v4 spelling: nested totals.
  const nested = (group: unknown, key: 'total' | string): number | null => {
    if (typeof group !== 'object' || group === null) return null
    return tokenCount((group as Record<string, unknown>)[key])
  }
  const inputNested = nested(u['inputTokens'], 'total')
  const outputNested = nested(u['outputTokens'], 'total')
  if (inputNested !== null && outputNested !== null) {
    return { inputTokens: inputNested, outputTokens: outputNested, totalTokens: inputNested + outputNested }
  }

  // Earlier specification spellings, on the same version-agnostic route. Not the
  // preferred path — it is a fallback so a v3-shaped answer does not read as
  // "no usage" and silently keep a whole reservation.
  const inputFlat = tokenCount(u['inputTokens']) ?? tokenCount(u['promptTokens'])
  const outputFlat = tokenCount(u['outputTokens']) ?? tokenCount(u['completionTokens'])
  if (inputFlat !== null && outputFlat !== null) {
    return { inputTokens: inputFlat, outputTokens: outputFlat, totalTokens: inputFlat + outputFlat }
  }

  return null
}

export interface UsageScanner {
  /** Feed decoded text as it arrives. Returns usage the moment it is complete. */
  push(text: string): TokenUsage | null
  /** Called once the stream ends. The last chance to find a partial object. */
  end(): TokenUsage | null
}

/**
 * Recover usage from a relayed body without buffering it.
 *
 * The response is handed to the tab by reference so a streaming generation is
 * never held behind the deadline — which means the only way to see the terminal
 * `finish` part is to read a copy of the stream. `sse` scans completed
 * `data:` lines and deliberately carries a partial line across `push` calls: a
 * JSON object can be split at any byte, so a scanner that treats every chunk
 * boundary as a line boundary is wrong exactly when the stream is largest.
 */
export function createUsageScanner(mode: 'sse' | 'json'): UsageScanner {
  let buffer = ''

  const fromLine = (line: string): TokenUsage | null => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return null
    const payload = trimmed.slice('data:'.length).trim()
    if (payload === '' || payload === '[DONE]') return null
    try {
      return extractUsage(JSON.parse(payload))
    } catch {
      return null
    }
  }

  if (mode === 'json') {
    // A JSON body has no meaningful internal line structure worth trusting, so
    // it is accumulated and read once at `end()` — the body is complete by then
    // by definition.
    return {
      push(text) {
        buffer += text
        return null
      },
      end() {
        const found = buffer.trim() === '' ? null : extractUsage(safeParse(buffer))
        buffer = ''
        return found
      },
    }
  }

  const scan = (flush: boolean): TokenUsage | null => {
    let found: TokenUsage | null = null
    for (;;) {
      const newline = buffer.indexOf('\n')
      if (newline === -1) break
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      found = fromLine(line) ?? found
    }
    if (flush && buffer.trim() !== '') {
      found = fromLine(buffer) ?? found
      buffer = ''
    }
    return found
  }

  return {
    push(text) {
      buffer += text
      return scan(false)
    },
    end() {
      return scan(true)
    },
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// --- what the tab is told ----------------------------------------------------

/** Headers this function adds to a proxied response. Closed set, like the
 *  upstream one: a name nobody anticipated is a value nobody audited. */
export const BROWSER_HEADER_NAMES = [
  'x-fx-model',
  'x-fx-provider',
  'x-fx-gateway-base',
  'x-fx-protocol-version',
  'x-fx-units',
  'x-fx-quota-remaining',
] as const

/** Without this the tab cannot read a single one of them: a response header the
 *  browser is not allowed to expose is a header the UI does not have, which
 *  would make the whole transparency half of the ownership decision invisible. */
export const EXPOSE_HEADERS = [...BROWSER_HEADER_NAMES].join(', ')

export interface ClientHeaderInfo {
  model: string
  provider: string
  /** The proxied base URL — *this function*, never the gateway. The agent's
   *  `fetch` override rewrites gateway URLs to it and passes the route as
   *  `?path=`, so handing the tab the real origin would be handing it a route
   *  that has no credential. */
  gatewayBaseUrl: string
  units: number
  remaining: number
  /** The server credential. Passed in so the check below is a fact rather than
   *  an assumption — see `buildBrowserHeaders`. */
  apiKey: string
}

/** Merge what the tab is told with the one upstream header we pass through.
 *
 * Two controls, both cheap:
 *   - `upstream` is filtered down to `content-type` again here, even though
 *     `buildGatewayResponse` already narrowed it. Belt and braces on the
 *     anti-leak invariant: a future caller that hands this function a raw
 *     upstream `Headers` still cannot put a `set-cookie` in front of a tab.
 *   - no value may contain the server credential. The values here come from
 *     server config rather than from the caller, so this is not the primary
 *     control — but "the config is trusted" is an assumption, and this turns it
 *     into an assertion that fails loudly instead of leaking quietly. */
export function buildBrowserHeaders(
  upstream: Record<string, string>,
  info: ClientHeaderInfo,
): Record<string, string> {
  const headers: Record<string, string> = {}
  const contentType = upstream['content-type']
  if (contentType !== undefined) headers['content-type'] = contentType

  headers['x-fx-model'] = info.model
  headers['x-fx-provider'] = info.provider
  headers['x-fx-gateway-base'] = info.gatewayBaseUrl
  headers['x-fx-protocol-version'] = GATEWAY_PROTOCOL_VERSION
  headers['x-fx-units'] = String(info.units)
  headers['x-fx-quota-remaining'] = String(info.remaining)

  if (info.apiKey !== '') {
    for (const [name, value] of Object.entries(headers)) {
      if (value.includes(info.apiKey)) {
        throw new ProxyError('credential_in_response', `${name} would have carried the gateway key`, 500)
      }
    }
  }
  return headers
}

export interface BootstrapInfo {
  /** The model that will run when the caller names none — resolved server-side. */
  model: string
  /** The proxied base URL, i.e. this function. */
  gatewayBaseUrl: string
  used: number
  limit: number
  unitsCharged: number
  /** Passed in so the anti-leak assertion below is a fact rather than an
   *  assumption: the payload is serialised into a response body, and a body is
   *  not covered by the header check in `buildBrowserHeaders`. */
  apiKey: string
}

/** What the tab may know about a model. The fields are exactly the ones needed to
 *  price a call and render a picker — and nothing that could route anything. */
export interface CatalogEntry {
  id: string
  label: string
  contextWindow: number
  maxOutputTokens: number
  tier: ModelDescriptor['tier']
  quotaRateTokensPerMin: number
  supportsTools: boolean
  supportsVision: boolean
  supportsReasoning: boolean
  provider: string
}

export interface BootstrapPayload {
  model: string
  provider: string
  gateway: { baseUrl: string; protocolVersion: string; modelHeader: string; modelQueryParam: string }
  quota: { used: number; limit: number; remaining: number }
  unitsCharged: number
  /** Every model this product offers, so the tab never has to guess or fetch a
   *  third-party catalogue to populate a picker. */
  models: ReadonlyArray<CatalogEntry>
}

/** Project a descriptor down to the published shape. An explicit allow-list, for
 *  the same reason the header sets are: a field nobody thought about is a field
 *  nobody audited. */
function toCatalogEntry(d: ModelDescriptor): CatalogEntry {
  return {
    id: d.id,
    label: d.label,
    contextWindow: d.contextWindow,
    maxOutputTokens: d.maxOutputTokens,
    tier: d.tier,
    quotaRateTokensPerMin: d.quotaRateTokensPerMin,
    supportsTools: d.supportsTools,
    supportsVision: d.supportsVision,
    supportsReasoning: d.supportsReasoning,
    provider: d.provider,
  }
}

/**
 * What the tab reads before its first agent call, so the `fetch` override can
 * build proxied URLs, the UI can name the model that will run, and the picker can
 * be populated without a second discovery route.
 *
 * Nothing caller-supplied reaches this payload, and the catalogue is server data
 * read from a frozen table — so the credential check is belt-and-braces the way
 * `buildBrowserHeaders`' is. It is kept anyway: `buildBrowserHeaders` guards the
 * response *headers*, and this is the response *body*. A new body field is exactly
 * how a key escapes a function that has a check on everything else.
 */
export function buildBootstrapPayload(info: BootstrapInfo): BootstrapPayload {
  const payload: BootstrapPayload = {
    model: info.model,
    provider: providerOf(info.model),
    gateway: {
      baseUrl: info.gatewayBaseUrl,
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      modelHeader: MODEL_HEADER,
      modelQueryParam: MODEL_QUERY_PARAM,
    },
    quota: { used: info.used, limit: info.limit, remaining: Math.max(0, info.limit - info.used) },
    unitsCharged: info.unitsCharged,
    models: listCatalog().map(toCatalogEntry),
  }

  if (info.apiKey !== '') {
    const serialised = JSON.stringify(payload)
    if (serialised.includes(info.apiKey)) {
      throw new ProxyError('credential_in_response', 'the bootstrap body would have carried the gateway key', 500)
    }
  }
  return payload
}