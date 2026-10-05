/**
 * The `fetch` override that routes the agent's model traffic through fx-gateway.
 *
 * ## Why an override and not a URL option
 *
 * `createFxAgent` accepts a `gatewayChatUrl`, and it looks like the obvious way to
 * point the agent somewhere. It is not: `fx-sdk.js#validateGatewayChatUrl`
 * accepts only the two canonical Vercel URLs or an **explicit loopback `http` URL
 * with a port**. There is no way to hand it an `https` Supabase function URL, so
 * the only channel left is `options.fetch` — which is a real, documented feature
 * of the SDK and not a hack.
 *
 * It is also not optional by preference. Measured: a browser cannot call
 * `ai-gateway.vercel.sh/v4/ai/language-model` from a local origin, because the
 * gateway sends no `Access-Control-Allow-Origin` for it, and the turn dies with
 * `HostStreamFailed` before a single token is generated. There is no client-side
 * arrangement that fixes that; the request has to originate server-side.
 *
 * ## The three paths libfx asks for
 *
 * Read out of the shipped binary and the shipped SDK, not from a doc:
 *
 *   strings node_modules/libfx/fx-core.wasm | grep ai-gateway
 *     → https://ai-gateway.vercel.sh
 *       https://ai-gateway.vercel.sh/v4/ai/language-model
 *       /coding-agent/v1/models
 *   fx-sdk.js#listModels
 *     → fetch("https://ai-gateway.vercel.sh/coding-agent/v1/models", { method: "GET" })
 *
 * `ROUTES` in `supabase/functions/fx-gateway/proxy.ts` already admits all three
 * shapes, version-agnostically: `{GET, /^\/coding-agent\/v\d+\/models$/}` and
 * `{POST, /^\/v\d+\/ai\/language-model$/}`. Both were exercised against the real
 * regular expressions, so this override does **not** need a third allow-list
 * entry. What it does need is to keep `MODEL_QUERY_PARAM = 'model'` working, and
 * it does — see `buildProxyUrl`.
 *
 * ## The anti-leak control, on this side
 *
 * `buildUpstreamHeaders` **never reads the caller's headers**. The SDK hands us
 * the headers the wasm core built, which include `authorization: Bearer <the
 * apiKey we passed to createFxAgent>`. That key is a placeholder — the real one
 * lives only in the edge function — and this function cannot see the tab's
 * cookies, its Supabase session in any other header, or anything else the core
 * decided to send, because it constructs the outgoing header set from its own
 * three known names. This is the browser half of the same invariant
 * `buildUpstreamRequest` enforces on the server half.
 *
 * Only one header is caller-derived and it is the point of the whole design: the
 * user's Supabase JWT, so fx-gateway can charge *them*.
 *
 * It arrives through a **callback**, not through an import of the Supabase
 * client, and that is not a stylistic choice. A module that reaches for
 * `import.meta.env` at load time cannot be loaded by Node or by a Deno edge
 * function — `import.meta.env` is undefined there, and the module throws before
 * its first export is read. This module is the request-shaping policy; the
 * policy is worth reusing from the server side and from a browser check, and a
 * session is a *runtime* value that refreshes on its own schedule. So the caller
 * supplies the reader and this file never learns where a token comes from.
 */

/**
 * Where fx-gateway lives.
 *
 * Derived from project config the app already has, and this is the **only**
 * address that has to be known up front. The function's own public base URL
 * cannot be derived by the browser: the edge runtime strips the function's own
 * path before the worker sees the request, so `new URL(req.url).origin` inside
 * the function is the bare project origin with no `/functions/v1/fx-gateway`
 * segment — which is exactly why `FX_GATEWAY_PUBLIC_URL` exists and why
 * `resolveGatewayBaseUrl` prefers it.
 *
 * So the two-step is not redundancy: this URL is how the tab *finds* the
 * function, and the base URL the function publishes is how the tab then builds
 * proxied request URLs. Hardcoding the second one would be wrong the moment the
 * project moved.
 *
 * Read from a parameter rather than from `import.meta.env` directly, for the same
 * reason the token is a callback: the caller already holds the project URL —
 * `src/lib/supabase.ts` reads the same variable — and passing it in keeps this
 * module loadable outside a Vite bundle.
 */
export function fxGatewayFunctionUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/fx-gateway`;
}

/** Reads the signed-in user's access token, or `null` when there is none. */
export type TokenReader = () => Promise<string | null>;

/** The gateway origin the wasm core addresses. Matched, never called. */
const GATEWAY_ORIGIN = 'https://ai-gateway.vercel.sh';

export interface CatalogEntry {
  id: string;
  label: string;
  contextWindow: number;
  maxOutputTokens: number;
  tier: 'free' | 'standard' | 'premium';
  quotaRateTokensPerMin: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  provider: string;
}

/** `GET /` on fx-gateway. Authenticated, and charged one token — by design. */
export interface GatewayBootstrap {
  model: string;
  provider: string;
  gateway: {
    baseUrl: string;
    protocolVersion: string;
    modelHeader: string;
    modelQueryParam: string;
  };
  quota: { used: number; limit: number; remaining: number };
  unitsCharged: number;
  models: CatalogEntry[];
}

export class GatewayError extends Error {
  constructor(message: string, readonly status: number | null, readonly code: string | null) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Read the bootstrap document.
 *
 * Throws rather than returning a partial: every field here is load-bearing and
 * the alternative is an agent that starts with a guessed base URL, and a guessed
 * base URL is a request to the wrong origin with the user's token on it.
 */
export async function readGatewayBootstrap(options: {
  /** The project's Supabase URL, from `import.meta.env.VITE_SUPABASE_URL`. */
  supabaseUrl: string;
  getToken?: TokenReader;
  fetchImpl?: typeof fetch;
}): Promise<GatewayBootstrap> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(fxGatewayFunctionUrl(options.supabaseUrl), {
    method: 'GET',
    headers: await authHeaders(options.getToken),
  });

  if (!response.ok) {
    const body = await readBody(response);
    throw new GatewayError(
      body.error ?? `fx-gateway answered HTTP ${response.status}`,
      response.status,
      body.code ?? null,
    );
  }
  return validateBootstrap((await response.json()) as unknown);
}

/**
 * The one caller-derived header.
 *
 * A missing token produces a request with no `authorization` at all rather than
 * a placeholder one. fx-gateway answers that 401 `unauthenticated`, which is the
 * truth; an empty bearer produces a 401 whose cause reads as a broken token
 * rather than a missing session, and those are different bugs on different sides
 * of the same wall.
 */
async function authHeaders(getToken: TokenReader | undefined): Promise<Record<string, string>> {
  const token = getToken === undefined ? null : await getToken();
  return token === null || token === '' ? {} : { authorization: `Bearer ${token}` };
}

async function readBody(response: Response): Promise<{ error?: string; code?: string }> {
  try {
    const parsed = (await response.json()) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const row = parsed as Record<string, unknown>;
      return {
        error: typeof row.error === 'string' ? row.error : undefined,
        code: typeof row.code === 'string' ? row.code : undefined,
      };
    }
  } catch {
    // A non-JSON error body (Kong's HTML, a gateway timeout page) is normal.
  }
  return {};
}

/**
 * Check the bootstrap before trusting it.
 *
 * A typed cast on `response.json()` would let a misconfigured deploy — a
 * function that answers 200 with an HTML page, or an older build without
 * `gateway` — reach the fetch override, which would then build request URLs from
 * `undefined`. The two fields that make a proxied call possible are required;
 * the rest degrades.
 */
function validateBootstrap(value: unknown): GatewayBootstrap {
  if (typeof value !== 'object' || value === null) {
    throw new GatewayError('fx-gateway did not return a bootstrap document', null, null);
  }
  const row = value as Record<string, unknown>;
  const gateway = typeof row.gateway === 'object' && row.gateway !== null ? (row.gateway as Record<string, unknown>) : {};
  const baseUrl = typeof gateway.baseUrl === 'string' ? gateway.baseUrl.replace(/\/+$/, '') : '';
  if (baseUrl === '') {
    throw new GatewayError('fx-gateway did not publish its own public base URL', null, 'missing_base_url');
  }
  return {
    model: typeof row.model === 'string' ? row.model : '',
    provider: typeof row.provider === 'string' ? row.provider : '',
    gateway: {
      baseUrl,
      protocolVersion: typeof gateway.protocolVersion === 'string' ? gateway.protocolVersion : '',
      // Both names are the server's to publish. Hardcoding them here would be a
      // second source of truth for a money path, which is the mistake
      // `models.ts` exists to avoid.
      modelHeader: typeof gateway.modelHeader === 'string' ? gateway.modelHeader : 'ai-language-model-id',
      modelQueryParam: typeof gateway.modelQueryParam === 'string' ? gateway.modelQueryParam : 'model',
    },
    quota: readQuota(row.quota),
    unitsCharged: typeof row.unitsCharged === 'number' ? row.unitsCharged : 0,
    models: readModels(row.models),
  };
}

function readQuota(value: unknown): GatewayBootstrap['quota'] {
  if (typeof value !== 'object' || value === null) return { used: 0, limit: 0, remaining: 0 };
  const row = value as Record<string, unknown>;
  const n = (key: string): number => (typeof row[key] === 'number' ? (row[key] as number) : 0);
  return { used: n('used'), limit: n('limit'), remaining: n('remaining') };
}

function readModels(value: unknown): CatalogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id === '') return [];
    return [
      {
        id: row.id,
        label: typeof row.label === 'string' ? row.label : row.id,
        contextWindow: numberOr(row.contextWindow, 0),
        maxOutputTokens: numberOr(row.maxOutputTokens, 0),
        tier: (row.tier === 'free' || row.tier === 'premium' ? row.tier : 'standard') as CatalogEntry['tier'],
        quotaRateTokensPerMin: numberOr(row.quotaRateTokensPerMin, 0),
        supportsTools: row.supportsTools === true,
        supportsVision: row.supportsVision === true,
        supportsReasoning: row.supportsReasoning === true,
        provider: typeof row.provider === 'string' ? row.provider : '',
      },
    ];
  });
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export interface GatewayFetchOptions {
  /** From the bootstrap. Never a constant — see `fxGatewayFunctionUrl`. */
  baseUrl: string;
  /** The `MODEL_QUERY_PARAM` name the server published. */
  modelQueryParam: string;
  /** A catalogue id, or `null` to let the server pick its default. */
  modelId: string | null;
  /** The user whose budget pays. Read per call so a refresh is picked up. */
  getToken?: TokenReader;
  /** Used for every request that is **not** a gateway URL. Defaults to `fetch`. */
  fallback?: typeof fetch;
  /** Observability. Never control flow. */
  onRewrite?: (from: string, to: string) => void;
}

/**
 * Build the proxied URL for one gateway path.
 *
 * The path is the one the wasm core asked for, verbatim, and the model travels on
 * the query string — never in a header and never in the body. That is the
 * server's rule (see `MODEL_QUERY_PARAM` in `proxy.ts`) and it is load-bearing:
 * `reconcileRequestBody` deletes `model` from the body so the header and the body
 * cannot compete, which means a header would be a caller-supplied header, which
 * is the one thing the upstream header set is built to make impossible.
 */
export function buildProxyUrl(
  baseUrl: string,
  path: string,
  modelQueryParam: string,
  modelId: string | null,
): string {
  const query = new URLSearchParams({ path });
  if (modelId !== null && modelId !== '') query.set(modelQueryParam, modelId);
  return `${baseUrl}?${query.toString()}`;
}

/**
 * The override handed to `createFxAgent({ fetch })`.
 *
 * Three rules, in order:
 *
 *  1. A URL on the gateway origin is **rewritten** to the proxy, with the route
 *     as `?path=`. Nothing else about the request survives except the method, the
 *     body and the abort signal.
 *  2. The outgoing header set is **built**, from three names. The SDK's headers
 *     are read only to decide the content type, never to forward a value.
 *  3. Anything that is not a gateway URL goes to `fallback` untouched, because
 *     the agent also fetches the user's own site and the tools' own endpoints. A
 *     blanket override that swallowed those would break more than it protects.
 */
export function createGatewayFetch(options: GatewayFetchOptions): typeof fetch {
  const { baseUrl, modelQueryParam, modelId } = options;
  const fallback = options.fallback ?? fetch.bind(globalThis);

  const override = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();

    if (!isGatewayUrl(url)) return fallback(input, init);

    const parsed = new URL(url);
    const proxied = buildProxyUrl(baseUrl, parsed.pathname, modelQueryParam, modelId);
    options.onRewrite?.(url, proxied);

    return fallback(proxied, {
      method,
      headers: await buildUpstreamHeaders(init?.headers, method, options.getToken),
      // `Uint8Array` as-is: `streamOpen` and `httpRequest` both hand the wasm
      // body's exact bytes over, and re-encoding them as a string would corrupt
      // anything that is not valid UTF-8. `duplex` is not needed in a browser.
      body: init?.body,
      signal: init?.signal,
    });
  };

  return override as typeof fetch;
}

function isGatewayUrl(url: string): boolean {
  return url.startsWith(`${GATEWAY_ORIGIN}/`);
}

/**
 * The three headers that cross to fx-gateway. Nothing else is constructible.
 *
 * `accept` is forwarded because the protocol version decides whether the answer
 * is one JSON document or an SSE stream, and getting it wrong turns a streaming
 * completion into a parse error that looks like a model failure. `content-type`
 * is set from the caller's method rather than copied, for the same reason the
 * server rebuilds it.
 */
async function buildUpstreamHeaders(
  callerHeaders: HeadersInit | undefined,
  method: string,
  getToken: TokenReader | undefined,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    accept: readAccept(callerHeaders) ?? 'application/json, text/event-stream',
  };
  if (method !== 'GET') headers['content-type'] = 'application/json';
  Object.assign(headers, await authHeaders(getToken));
  return headers;
}

/** Read one header value off whatever shape the SDK used. Never a whole set. */
function readAccept(callerHeaders: HeadersInit | undefined): string | null {
  if (callerHeaders === undefined) return null;
  if (callerHeaders instanceof Headers) return callerHeaders.get('accept');
  if (Array.isArray(callerHeaders)) {
    const found = callerHeaders.find(([name]) => name.toLowerCase() === 'accept');
    return found?.[1] ?? null;
  }
  const record = callerHeaders as Record<string, string>;
  for (const [name, value] of Object.entries(record)) {
    if (name.toLowerCase() === 'accept') return value;
  }
  return null;
}

/**
 * The placeholder key handed to `createFxAgent`.
 *
 * It is not a credential and must never be one: `fx-sdk.js` puts it in
 * `AI_GATEWAY_API_KEY` in the wasm environment, from where the core puts it in an
 * `authorization` header on every request — and this module's override drops that
 * header on the floor. A readable, obviously-fake value is the whole point: a real
 * key pasted here would be a key in the bundle, and a *random* one would be
 * indistinguishable from a real one in a grep.
 */
export const FX_GATEWAY_PLACEHOLDER_KEY = 'mizpa-proxy-placeholder-not-a-key';

/**
 * The model id to send, validated against the published catalogue.
 *
 * The server is the authority — `selectModel` 400s an id it does not publish,
 * before a single unit is charged — and this is the early, cheap half of the same
 * check. A `null` here means "let the server decide", which is the correct
 * default and not a fallback: an id the browser made up is a bug, and silently
 * substituting the default for it would hide that bug behind a working turn.
 */
export function selectProxyModel(requested: string | null, catalogue: readonly CatalogEntry[]): string | null {
  if (requested === null || requested.trim() === '') return null;
  const id = requested.trim();
  return catalogue.some((entry) => entry.id === id) ? id : null;
}
