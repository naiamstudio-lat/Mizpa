/**
 * A client for exactly one MCP server: IsAgentReady.
 *
 * Not a general MCP framework, and deliberately so. This server's handshake is
 * known and short, and the only reason a client exists at all is that the two
 * tools Mizpa needs take *different argument names*:
 *
 *   scan_website      { url }     — verified from `tools/list`
 *   get_scan_results  { domain }  — verified from `tools/list`
 *
 * A generic client would have to model `tools/list` schemas, batching,
 * pagination, progress notifications, resources and prompts to save the caller
 * from hard-coding two names. That is a lot of surface for a server that
 * publishes eight tools and no resources, four of which are owner-authorised
 * monitoring reads Mizpa has no identity for.
 *
 * ## Measured against the live server (2026-10-02)
 *
 * `POST https://isagentready.com/mcp`, `accept: application/json,
 * text/event-stream`, **no authentication**:
 *
 *   - `initialize` → 200, `mcp-session-id: <uuid>` in the *response headers*,
 *     body `{capabilities:{resources,tools}, protocolVersion:"2025-03-26",
 *     serverInfo:{name:"com.isagentready/scanner",version:"1.0.0"}}`.
 *   - Every non-`initialize` request carries that id as a request header, per
 *     the Streamable HTTP transport. **Measured caveat:** this server does not
 *     actually enforce it — a `tools/call` with no session header, and with no
 *     `notifications/initialized` at all, also answers 200 with the report. The
 *     client still sends both, because the next release of any MCP server may
 *     enforce it and a client that quietly depended on the leniency would break
 *     on a dependency bump rather than on its own change.
 *   - A wrong argument name is **not** a silent no-op: HTTP 200 with
 *     `result.isError: true` and the text
 *     `invalid_arguments: [{"code":"required","message":"is required",
 *     "path":"/url"},{"code":"additional_property","message":"is not allowed",
 *     "path":"/domain"}]`. Parsed here so the UI can say which name was wrong
 *     instead of showing raw JSON.
 *   - `ratelimit-policy: hourly;q=100;w=3600`, per IP, unauthenticated. Not a
 *     detail: it is why `scan.ts` caches and why the poll interval is 5 s and
 *     not 2 s. See `SCAN_POLL_INTERVAL_MS`.
 *
 * ## Why the transport is injected
 *
 * The server sends **no `Access-Control-Allow-Origin`** on any route and
 * answers `OPTIONS /mcp` with 405 (measured), so a browser page cannot call it
 * directly — the same class of wall as the AI Gateway, and for the same reason.
 * The transport is therefore a parameter, and two implementations exist:
 * `directMcpTransport` (this module) against whatever URL it is given, and the
 * dev relay in `vite.config.ts` / the future edge function, which terminate CORS
 * and forward the bytes unchanged. Nothing in the client above this line knows
 * or cares which one is in play, which is the point: the same code path is what
 * the agent's tool runs and what the onboarding runs.
 */

/** The protocol version Mizpa asks for. The server answered `2025-03-26`. */
const CLIENT_PROTOCOL_VERSION = '2025-06-18';

const CLIENT_INFO = { name: 'mizpa', version: '0.1.0' } as const;

/** One request to the server. `sessionId` is the id `initialize` handed back. */
export interface McpRequest {
  body: string;
  sessionId: string | null;
  signal?: AbortSignal;
}

/**
 * One response. Narrower than `Response` on purpose: a transport that cannot
 * see the session header (a relay that swallowed it) reports `null` and the
 * client copes by re-initialising, rather than the type pretending it can.
 */
export interface McpResponse {
  status: number;
  sessionId: string | null;
  /** The parsed JSON-RPC envelope, or `null` when the body was not JSON. */
  envelope: unknown;
  /**
   * Seconds until the server will answer again, from `Retry-After`.
   *
   * Present because this server rate-limits per IP and says so with a real
   * number (measured: `HTTP 429`, `retry-after: 2297`,
   * `ratelimit-policy: hourly;q=100;w=3600`). "Too many requests" with no wait
   * time is the least actionable error a service can hand out, and a visitor who
   * is told to "try again" and is then refused again has been told something
   * false.
   */
  retryAfterSeconds: number | null;
  /** Requests left in the current window, from `ratelimit-remaining`. */
  rateLimitRemaining: number | null;
}

export type McpTransport = (request: McpRequest) => Promise<McpResponse>;

/** Why a call failed, in the shapes the caller has to tell apart. */
export type McpFailure =
  /** The request never produced a response: DNS, TLS, offline, or CORS. */
  | 'unreachable'
  /** A response arrived but was not a JSON-RPC envelope. */
  | 'protocol'
  /** The server answered with a JSON-RPC `error`. */
  | 'rpc'
  /** The tool ran and reported failure in `result.isError`. */
  | 'tool'
  /** The server's per-IP budget is spent. Carries a real wait time. */
  | 'rate_limited'
  /** The caller's deadline, or an `AbortSignal` it was handed. */
  | 'aborted';

export class McpError extends Error {
  constructor(
    readonly failure: McpFailure,
    message: string,
    /** The server's own text, verbatim. Shown in the UI, never swallowed. */
    readonly detail?: string,
    /** Seconds to wait, when the server said. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

/**
 * The argument violations `tools/call` reports for a wrong tool name.
 *
 * The server encodes them as a JSON array after a fixed `invalid_arguments: `
 * prefix inside `result.content[0].text`. Parsing it is the difference between
 * "the scan failed" and "`scan_website` wants `url`, not `domain`" — and the
 * second one is a bug in *our* call that must be legible, not a network fault.
 */
export interface ArgumentViolation {
  code: string;
  message: string;
  path: string;
}

export function parseArgumentViolations(text: string): ArgumentViolation[] {
  const marker = 'invalid_arguments:';
  const at = text.indexOf(marker);
  if (at === -1) return [];
  try {
    const parsed: unknown = JSON.parse(text.slice(at + marker.length).trim());
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const row = entry as Record<string, unknown>;
      return [
        {
          code: typeof row.code === 'string' ? row.code : 'unknown',
          message: typeof row.message === 'string' ? row.message : 'is not acceptable here',
          path: typeof row.path === 'string' ? row.path : '',
        },
      ];
    });
  } catch {
    return [];
  }
}

/** `true` when the tool's failure is a bad argument name, not a broken server. */
export function isArgumentFailure(text: string): boolean {
  return text.includes('invalid_arguments:');
}

/**
 * The result of one `tools/call`, reduced to the two fields a caller wants: the
 * parsed payload and whether the tool itself reported failure.
 */
export interface ToolCallResult {
  value: unknown;
  isError: boolean;
  /** `result.content[0].text` when there was one, for error messages. */
  text: string;
}

function readFirstText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  for (const part of content) {
    if (typeof part === 'object' && part !== null) {
      const value = (part as Record<string, unknown>).text;
      if (typeof value === 'string') return value;
    }
  }
  return '';
}

/**
 * Read a `tools/call` result.
 *
 * `structuredContent` is preferred and is what the live server sends; the
 * `content[0].text` JSON is the fallback because Streamable HTTP servers are
 * allowed to answer with text parts only, and this server's own `not_found` and
 * `started` payloads appear in both. The two are the same document, so a server
 * that sent one and not the other is not a case worth branching on.
 */
function readToolResult(result: unknown): ToolCallResult {
  if (typeof result !== 'object' || result === null) {
    throw new McpError('protocol', 'the server returned a tool result that is not an object');
  }
  const row = result as Record<string, unknown>;
  const text = readFirstText(row.content);
  const isError = row.isError === true;

  if (row.structuredContent !== undefined && row.structuredContent !== null) {
    return { value: row.structuredContent, isError, text };
  }
  if (text === '') return { value: {}, isError, text };
  try {
    return { value: JSON.parse(text), isError, text };
  } catch {
    return { value: { message: text }, isError, text };
  }
}

export interface IsAgentReadyClientOptions {
  transport: McpTransport;
  /** Per-request deadline. The default is the scan budget, not a network guess. */
  timeoutMs?: number;
}

/**
 * The session-owning client.
 *
 * Lazily initialises on the first tool call, carries the session id on every
 * request after that, and re-initialises **once** if the server drops the
 * session — which a Streamable HTTP server is entitled to do at any time, and
 * which shows up as HTTP 404. One retry, not a loop: a server that answers 404
 * to a fresh `initialize` is not going to answer the call either, and retrying
 * forever would turn a broken deployment into a spinning tab.
 */
export class IsAgentReadyClient {
  readonly #transport: McpTransport;
  readonly #timeoutMs: number;
  #sessionId: string | null = null;
  #ready: Promise<void> | null = null;
  #nextId = 1;

  constructor(options: IsAgentReadyClientOptions) {
    this.#transport = options.transport;
    this.#timeoutMs = options.timeoutMs ?? 90_000;
  }

  /** The session id, for a transport that has to echo it somewhere. */
  get sessionId(): string | null {
    return this.#sessionId;
  }

  /**
   * Call one tool and return its payload, or throw.
   *
   * `McpError('tool')` means the tool ran and reported a problem — a wrong
   * argument name, a domain it has never seen. That is a different fault from a
   * transport failure and the UI renders them differently, so it is not
   * flattened here.
   */
  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const { value, isError, text } = await this.#invoke(name, args, signal);
    if (isError) throw new McpError('tool', `${name} failed`, text);
    return value;
  }

  /** The same call, but the failure is returned rather than thrown. */
  async tryCallTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolCallResult> {
    return this.#invoke(name, args, signal);
  }

  async #invoke(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolCallResult> {
    await this.#ensureSession(signal);
    try {
      return await this.#toolsCall(name, args, signal);
    } catch (error) {
      // A dropped session is the one transport failure worth a second attempt,
      // because the request that failed never reached the tool. Defensive rather
      // than observed: see the measured caveat at the top of this file.
      if (error instanceof McpError && error.detail === SESSION_EXPIRED) {
        this.#sessionId = null;
        await this.#ensureSession(signal);
        return this.#toolsCall(name, args, signal);
      }
      throw error;
    }
  }

  async #toolsCall(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolCallResult> {
    const result = await this.#send({ method: 'tools/call', params: { name, arguments: args } }, { signal });
    return readToolResult(result);
  }

  /**
   * The handshake, once.
   *
   * Concurrent first calls share one `initialize`: the onboarding scan and the
   * agent's tool can both fire on the same domain, and two handshakes would
   * leave the first one's session orphaned. The promise is cleared in a
   * `finally` so a failed handshake is retried by the next call rather than
   * cached as a permanent failure.
   */
  async #ensureSession(signal?: AbortSignal): Promise<void> {
    if (this.#sessionId !== null) return;
    this.#ready ??= this.#handshake(signal).finally(() => {
      this.#ready = null;
    });
    await this.#ready;
  }

  async #handshake(signal?: AbortSignal): Promise<void> {
    await this.#send(
      {
        method: 'initialize',
        params: { protocolVersion: CLIENT_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
      },
      { signal },
    );
    // Sent but not awaited for a result: it is a notification, so there is no
    // id and no answer, and a server that rejects it has already told us
    // everything we need from `initialize`.
    void this.#send({ method: 'notifications/initialized' }, { signal, notification: true });
  }

  async #send(
    payload: Record<string, unknown>,
    options: { signal?: AbortSignal; notification?: boolean } = {},
  ): Promise<unknown> {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      // A notification carries no id. An id here would make the server answer
      // something the client then has to correlate and discard.
      ...(options.notification ? {} : { id: this.#nextId++ }),
      ...payload,
    });
    const deadline = AbortSignal.timeout(this.#timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;

    let response: McpResponse;
    try {
      response = await this.#transport({ body, sessionId: this.#sessionId, signal });
    } catch (error) {
      if (error instanceof McpError) throw error;
      // `AbortSignal.any`/`timeout` reject with `TimeoutError`/`AbortError`; both
      // are the caller's deadline, and neither is the server's fault.
      const name = (error as { name?: string } | null)?.name;
      if (name === 'TimeoutError') throw new McpError('aborted', 'the scanner did not answer in time');
      if (name === 'AbortError') throw new McpError('aborted', 'the scan was cancelled');
      throw new McpError('unreachable', 'the scan could not reach the scanner', message(error));
    }

    // The server re-issues the session on every response, so a transport that
    // can read it keeps the id fresh without a second round trip.
    if (response.sessionId !== null) this.#sessionId = response.sessionId;

    // A notification is answered 202 with an empty body. That is a success and
    // must not be mistaken for a malformed envelope.
    if (options.notification === true) return {};

    // Streamable HTTP: 404 on a request that carried a session means the
    // session is gone, and the spec's answer is to start a new one.
    if (response.status === 404 && this.#sessionId !== null) {
      throw new McpError('rpc', 'the scanner session expired', SESSION_EXPIRED);
    }
    // 429 before anything else: the per-IP budget is spent, and that is a
    // different fault with a different remedy from every other 4xx. Measured
    // 2026-10-02 by exhausting it — the server answers 429 on `initialize`
    // itself, so this is reached before any tool call, and it carries
    // `retry-after` in seconds.
    if (response.status === 429) {
      throw new McpError(
        'rate_limited',
        'the scanner is rate-limiting this address',
        'The IsAgentReady scanner allows 100 requests an hour per IP address, and this one is spent.',
        response.retryAfterSeconds,
      );
    }
    if (response.status >= 400) {
      throw new McpError('rpc', `the scanner answered HTTP ${response.status}`);
    }
    if (response.envelope === null || typeof response.envelope !== 'object') {
      throw new McpError('protocol', 'the scanner answered with something that is not JSON-RPC');
    }

    const envelope = response.envelope as Record<string, unknown>;
    if (envelope.error !== undefined && envelope.error !== null) {
      const error = envelope.error as { message?: string };
      throw new McpError('rpc', error.message ?? 'the scanner reported an error');
    }
    if (envelope.result === undefined) {
      throw new McpError('protocol', 'the scanner answered without a result');
    }
    return envelope.result;
  }
}

const SESSION_EXPIRED = 'session_expired';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
