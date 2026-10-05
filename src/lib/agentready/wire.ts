/**
 * The wire: bytes in, JSON-RPC envelope out.
 *
 * Split out of `mcp.ts` because the two halves fail for different reasons and are
 * replaced for different reasons. This half is about HTTP — a preflight, a
 * `content-type`, a header the server only sends sometimes. The client half is
 * about protocol — a session, an id, a retry. A change to how the MCP transport
 * is spoken should not touch the session logic, and a relay that cannot expose a
 * header should not change the client.
 *
 * Everything here is a *measurement* of `https://isagentready.com`, taken
 * 2026-10-02. See `mcp.ts` for the handshake and the tool-call rules.
 */

import { McpError, type McpTransport } from './mcp';

export const IS_AGENT_READY_MCP_URL = 'https://isagentready.com/mcp';

/**
 * Same-origin path the browser uses instead of {@link IS_AGENT_READY_MCP_URL}.
 *
 * Not an optimisation — a necessity, because the origin refuses cross-origin
 * reads (no `Access-Control-Allow-Origin` on any route, `OPTIONS /mcp` → 405).
 * In this workspace it is served by the `agent-ready-relay` Vite plugin in dev and
 * preview; in production it has to be an edge function, because a static host
 * cannot terminate CORS for somebody else's server.
 */
export const IS_AGENT_READY_RELAY_PATH = '/api/agentready';

/**
 * Parse a Streamable HTTP body.
 *
 * The live server answers `application/json`, but the transport advertises
 * `text/event-stream` as acceptable and a server may answer either. An SSE
 * envelope is a sequence of `data:` lines; the last one that parses as JSON is
 * the response, because progress notifications would have come before it.
 */
function parseEnvelope(contentType: string, body: string): unknown {
  if (contentType.includes('text/event-stream')) {
    let found: unknown = null;
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice('data:'.length).trim();
      if (payload === '' || payload === '[DONE]') continue;
      try {
        found = JSON.parse(payload);
      } catch {
        // A split or non-JSON frame is skipped rather than failing the call;
        // a later frame is the one that answers the request.
      }
    }
    return found;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

/**
 * The transport that speaks to the server itself.
 *
 * It forwards bytes and reads the session header; it makes no protocol
 * decisions. Given a same-origin URL it works unchanged from a tab, which is
 * what makes the client verifiable in a real browser rather than only in Node.
 */
export function directMcpTransport(endpoint: string, fetchImpl: typeof fetch = fetch): McpTransport {
  return async (request) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      // Both are advertised, per the Streamable HTTP transport spec.
      accept: 'application/json, text/event-stream',
    };
    if (request.sessionId !== null) headers['mcp-session-id'] = request.sessionId;

    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: request.body,
        signal: request.signal,
      });
    } catch (error) {
      // One message for DNS, TLS, offline and CORS, because from here they are
      // indistinguishable — `fetch` reports a blocked preflight as a bare
      // `TypeError`. The distinction that *is* knowable, "we never left the
      // page", is worth saying, so it is said.
      throw new McpError(
        'unreachable',
        `no response from ${endpoint}`,
        error instanceof Error ? error.message : String(error),
      );
    }

    const body = await response.text();
    return {
      status: response.status,
      // Absent on a transport that cannot expose it; the client re-initialises.
      sessionId: response.headers.get('mcp-session-id'),
      envelope: parseEnvelope(response.headers.get('content-type') ?? '', body),
      retryAfterSeconds: readSeconds(response.headers.get('retry-after')),
      rateLimitRemaining: readNumber(response.headers.get('ratelimit-remaining')),
    };
  };
}

function readSeconds(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function readNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
