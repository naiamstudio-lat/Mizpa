/**
 * Choosing how a browser tab reaches the scanner.
 *
 * ## The constraint, measured
 *
 * `https://isagentready.com` sends **no `Access-Control-Allow-Origin`** on any
 * route, and answers `OPTIONS /mcp` with **405** (measured 2026-10-02 with an
 * `Origin: http://localhost:5173` header; also checked on `POST /api/v1/scan`,
 * `/llms.txt` and `/openapi.json` — zero CORS headers anywhere). A cross-origin
 * response without `Access-Control-Allow-Origin` is unreadable by JavaScript
 * whatever the request looked like, so a tab **cannot** call the scanner
 * directly. It is the same wall as the AI Gateway, and it has the same answer:
 * something server-side has to be the one that makes the request.
 *
 * That "something" is not optional to name, only to implement in one step:
 *
 *  - **Production** needs an edge function. It has to be a real deploy, and this
 *    change does not deploy anything, so production is left with a documented
 *    hole rather than a fake path that 404s in a way nobody reads as a hole.
 *  - **This workspace** serves the same relay from the Vite dev/preview server, as
 *    the `agent-ready-relay` plugin in `vite.config.ts`. It is a byte-forwarder:
 *    it adds `Access-Control-Allow-Origin` and copies the response headers
 *    (`mcp-session-id` among them) back. It changes no payload and implements no
 *    protocol, so everything above it — handshake, argument names, polling,
 *    failures — is the production code path, running in a real browser.
 *
 * ## The rule that keeps this honest
 *
 * The relay is selected by **capability, not by a flag that could lie**. A tab
 * asks the same origin; if the dev server or an edge function answers, the
 * scanner works, and if nothing answers, `ScanError('unreachable')` is rendered
 * with the reason. There is no build-time switch that makes the UI *look* like
 * the scan succeeded, and no fallback that quietly swaps the scanner for
 * something local — a fabricated grade would be the single worst thing this
 * feature could do.
 */

import type { McpTransport } from './mcp';
import { IS_AGENT_READY_MCP_URL, IS_AGENT_READY_RELAY_PATH, directMcpTransport } from './wire';

/**
 * Where a browser tab sends the MCP handshake.
 *
 * Same-origin, always. A cross-origin URL would only work on a host that chose
 * to allow this origin, which is not a thing the tab can decide.
 */
export const BROWSER_MCP_URL = IS_AGENT_READY_RELAY_PATH;

/** The upstream URL, for non-browser callers (a test, a Deno function, curl). */
export const UPSTREAM_MCP_URL = IS_AGENT_READY_MCP_URL;

/**
 * The transport the onboarding and the agent's tool both use in a tab.
 *
 * Takes the URL as a parameter so a caller with a different deployment — a
 * production edge function on another path, an internal mirror — can point
 * somewhere else without this module growing a configuration system for one
 * value.
 */
export function browserScanTransport(url: string = BROWSER_MCP_URL): McpTransport {
  return directMcpTransport(url, fetch);
}

/**
 * Straight at the upstream. Only for a runtime that is not a browser, or for a
 * host that has been granted CORS access.
 */
export function upstreamScanTransport(): McpTransport {
  return directMcpTransport(UPSTREAM_MCP_URL, fetch);
}
