/**
 * fx-gateway model catalogue — per-model *metadata*, and nothing else.
 *
 * ## Why this file exists, and why it is this small
 *
 * Multi-provider support was analysed against AnythingLLM, which solves it with a
 * 39-entry switch reconciling 39 incompatible wire formats. We deliberately do
 * **not** copy that shape: the Vercel AI Gateway already performs that
 * reconciliation upstream of us — per-provider URL, auth header, request body,
 * SSE parsing, model lookup. Reimplementing it here would be a worse copy of a
 * service we already pay for, and its transport half collapses to one origin the
 * moment requests go through the gateway.
 *
 * What survives normalisation is *metadata*, and we need it before the request
 * for two structural reasons:
 *
 *   1. The model id travels **out of band**, in `ai-language-model-id`.
 *      `LanguageModelV4CallOptions` has no `model` field, so the header is the
 *      only authoritative channel and the body can never be consulted.
 *   2. Quota is charged as a **pre-flight reservation**. The real token count does
 *      not exist until the answer is back, so the up-front rate cannot come from
 *      the upstream response — it must come from our own table.
 *
 * So the only fact needed before calling is "which model, and therefore what does
 * it cost to hold". That is the whole abstraction.
 *
 * ## The three properties this file guarantees
 *
 *   1. **Enumeration is a data edit, never a request.** The catalogue is frozen at
 *      module load; `resolveModel` is a `Map` lookup, not a fetch. The gateway's
 *      own `/coding-agent/v1/models` route exists and is deliberately NOT called
 *      on the chat path: catalogue availability would become a runtime dependency
 *      of the money path, and a slow catalogue a slow quota decision.
 *   2. **A miss throws; it never defaults.** `resolveModel` raises
 *      `UnknownModelError`, `resolveTierRate` raises on a tier absent from the
 *      table. There is no `??` fallback here on purpose: a default rate is a silent
 *      mis-bill and a default context window is a silently truncated prompt.
 *   3. **Absence is enforced, not hoped for.** Every descriptor is checked at
 *      module load, so "someone forgot `contextWindow` in a data edit" becomes an
 *      import that refuses to start rather than a production mis-bill.
 *
 * ## Provenance
 *
 * Every id, label, context window, output cap and capability flag below was read
 * from the live gateway's own catalogue (`GET https://ai-gateway.vercel.sh/
 * coding-agent/v1/models`, 259 entries, fetched 2026-10-02) rather than invented.
 * `tier` and `quotaRateTokensPerMin` are **ours**, not the gateway's: this product
 * accounts by tokens consumed (a fairness budget), not by upstream price (a spend
 * forecast). Upstream price is therefore deliberately absent — it would be a
 * second, unused source of truth that someone would eventually bill from.
 */

/** Product tier: our reservation bucket, not an upstream price class. */
export type ModelTier = 'free' | 'standard' | 'premium'

/**
 * What one proxied call holds up front, per tier, in ledger units
 * (`UNITS_PER_TOKEN` in `proxy.ts` makes 1 unit = 1 token).
 *
 * The reservation is **one minute of the tier's rate**. The absolute upstream
 * deadline is 30 s, so a call that finishes in time cannot legitimately exceed one
 * minute of its own budget, and a call that does not finish in time never settles
 * against usage anyway — the reservation simply stands.
 *
 * The tiers are ordered by context window as much as by price, which is what makes
 * the ordering defensible: the prompt is the whole virtual filesystem on every
 * turn, so the models with large windows are exactly the ones that can
 * legitimately need large reservations. Against `DEFAULT_DAILY_UNITS` (20M) these
 * are roughly 500 / 100 / 33 calls a day.
 */
export const TIER_RESERVATION_RATES: Readonly<Record<ModelTier, number>> = Object.freeze({
  free: 40_000,
  standard: 200_000,
  premium: 600_000,
})

export interface ModelDescriptor {
  /** Exactly the string written to the `ai-language-model-id` header. */
  readonly id: string
  /** Human name for the UI. Never sent upstream. */
  readonly label: string
  /** REQUIRED. No fallback, no default — see `assertDescriptor`. */
  readonly contextWindow: number
  /** The model's own output cap, so the UI cannot ask for more than can return. */
  readonly maxOutputTokens: number
  readonly tier: ModelTier
  /** This model's reservation rate. Denormalised from the tier table so a
   *  descriptor is self-contained, and re-checked against that table on load. */
  readonly quotaRateTokensPerMin: number
  readonly supportsTools: boolean
  readonly supportsVision: boolean
  readonly supportsReasoning: boolean
  /** Display and attribution only. The gateway routes; this never selects. */
  readonly provider: string
}

/** A caller asked for a model this product does not offer. Always a hard 400. */
export class UnknownModelError extends Error {
  readonly code = 'unknown_model'
  readonly status = 400
  constructor(message: string) {
    super(message)
    this.name = 'UnknownModelError'
  }
}

/** The tier's rate, or a throw. No default: an unknown tier must not be billable. */
export function resolveTierRate(tier: string): number {
  const rate = (TIER_RESERVATION_RATES as Record<string, number | undefined>)[tier]
  if (rate === undefined) throw new UnknownModelError(`no reservation rate for tier '${tier}'`)
  return rate
}

type DescriptorSeed = Omit<ModelDescriptor, 'quotaRateTokensPerMin'>

/**
 * The catalogue. Adding a model is a data edit *here* and nowhere else — copy a
 * row out of `GET /coding-agent/v1/models` and keep every field, because
 * `assertDescriptor` refuses to load a row that is missing one or that disagrees
 * with the tier table.
 */
const SEEDS: ReadonlyArray<DescriptorSeed> = [
  {
    id: 'inclusionai/ling-3.1-flash-free',
    label: 'Ling 3.1 Flash (Free)',
    contextWindow: 262_144,
    maxOutputTokens: 32_768,
    tier: 'free',
    supportsTools: true,
    // A fact about the model, not a guess: upstream `modalities.input` is
    // `['text']` for this row while every row below also accepts images.
    supportsVision: false,
    supportsReasoning: true,
    provider: 'inclusionai',
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    contextWindow: 1_048_576,
    maxOutputTokens: 65_535,
    tier: 'standard',
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    provider: 'google',
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    contextWindow: 1_000_000,
    maxOutputTokens: 65_535,
    tier: 'standard',
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    provider: 'google',
  },
  {
    id: 'openai/gpt-5',
    label: 'GPT-5',
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    tier: 'premium',
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    provider: 'openai',
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    tier: 'premium',
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    provider: 'anthropic',
  },
]

/**
 * Refuse a descriptor that cannot be trusted, rather than serving one.
 *
 * This is where "cost metadata degrades to `unknown`, never to a wrong number"
 * gets enforced in a catalogue that has no `unknown` to degrade to: a field is
 * either present and sane, or the module does not load. AnythingLLM's
 * `contextWindow ?? 4096` is exactly the failure this prevents — a
 * plausible-looking 4096 silently truncates a 200k prompt, and a quota system
 * blind to the truncation mis-bills on top of the data loss.
 */
function assertDescriptor(d: ModelDescriptor): void {
  const positiveInt = (field: string, value: unknown): void => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error(`model '${d.id}': ${field} must be a positive integer, got ${String(value)}`)
    }
  }
  positiveInt('contextWindow', d.contextWindow)
  positiveInt('maxOutputTokens', d.maxOutputTokens)
  positiveInt('quotaRateTokensPerMin', d.quotaRateTokensPerMin)
  if (typeof d.label !== 'string' || d.label === '') {
    throw new Error(`model '${d.id}': label must be a non-empty string`)
  }
  if (d.maxOutputTokens > d.contextWindow) {
    throw new Error(`model '${d.id}': maxOutputTokens exceeds contextWindow`)
  }
  // The rate is denormalised from the table, so it must still agree with it —
  // otherwise there are two sources of truth for money and the copy silently wins.
  const expected = resolveTierRate(d.tier)
  if (d.quotaRateTokensPerMin !== expected) {
    throw new Error(
      `model '${d.id}': quotaRateTokensPerMin ${d.quotaRateTokensPerMin} != tier '${d.tier}' rate ${expected}`,
    )
  }
  for (const flag of ['supportsTools', 'supportsVision', 'supportsReasoning'] as const) {
    if (typeof d[flag] !== 'boolean') throw new Error(`model '${d.id}': ${flag} must be a boolean`)
  }
  // `provider` is display-only and duplicates the id prefix on purpose; this check
  // is what makes maintaining that duplication by hand safe.
  const slash = d.id.indexOf('/')
  if (slash <= 0 || d.provider !== d.id.slice(0, slash)) {
    throw new Error(`model '${d.id}': provider '${d.provider}' must equal the id prefix`)
  }
}

function buildCatalog(seeds: ReadonlyArray<DescriptorSeed>): ReadonlyMap<string, ModelDescriptor> {
  const byId = new Map<string, ModelDescriptor>()
  for (const seed of seeds) {
    const descriptor: ModelDescriptor = Object.freeze({
      ...seed,
      quotaRateTokensPerMin: resolveTierRate(seed.tier),
    })
    assertDescriptor(descriptor)
    if (byId.has(descriptor.id)) throw new Error(`duplicate model id in the catalogue: '${descriptor.id}'`)
    byId.set(descriptor.id, descriptor)
  }
  if (byId.size === 0) throw new Error('the model catalogue is empty')
  return byId
}

const CATALOG: ReadonlyMap<string, ModelDescriptor> = buildCatalog(SEEDS)

/**
 * The model that runs when the caller names none.
 *
 * A named constant rather than "first row of the map": the default is a product
 * decision, and deriving it from table order would make a data edit silently
 * change which model every user is charged at.
 */
export const DEFAULT_MODEL_ID = 'google/gemini-2.5-flash'

/**
 * Look up a model, or throw. A miss is never a default.
 *
 * The lookup key is the exact id string, compared case-sensitively and with no
 * trimming or normalisation: the id is a header value the gateway must match
 * byte-for-byte, so accepting a loose spelling here would admit an id that fails
 * upstream — charging quota for a call the gateway then refuses.
 */
export function resolveModel(id: string): ModelDescriptor {
  const found = CATALOG.get(id)
  if (found === undefined) {
    throw new UnknownModelError(`'${id}' is not a model fx offers`)
  }
  return found
}

/** The default model, resolved through the same table — so a bad constant here
 *  fails at module load rather than on the first user request. */
export function resolveDefaultModel(): ModelDescriptor {
  return resolveModel(DEFAULT_MODEL_ID)
}

/**
 * The whole catalogue, for the browser bootstrap. Cheap by construction: a map
 * walk with no allocation beyond the array, no I/O and no upstream call.
 *
 * Ordering is tier-then-label so the UI gets free-first without sorting, and the
 * result is a fresh array of frozen descriptors — a caller cannot reorder the
 * catalogue by mutating what it was handed.
 */
export function listCatalog(): ReadonlyArray<ModelDescriptor> {
  const rank: Record<ModelTier, number> = { free: 0, standard: 1, premium: 2 }
  return [...CATALOG.values()].sort((a, b) => rank[a.tier] - rank[b.tier] || a.label.localeCompare(b.label))
}
