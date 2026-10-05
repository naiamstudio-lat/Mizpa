import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Must match `FX_CORE_WASM_PATH` in `src/lib/fx/runtime.ts`. */
const FX_CORE_WASM_URL = '/fx/fx-core.wasm';

/**
 * Where `fx-core.wasm` lives. Resolved through the package's own `exports` map
 * rather than by walking to `node_modules/libfx`: `libfx@0.0.12` does not
 * export `./package.json`, so `require.resolve('libfx/package.json')` throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`, while `libfx/browser` is a declared export
 * and resolves from any dependency layout (npm, pnpm, hoisted or not).
 */
function libfxPackageDir(): string {
  return dirname(createRequire(import.meta.url).resolve('libfx/browser'));
}

/**
 * Serves the 2.25 MB `fx-core.wasm` from `node_modules` in dev and emits the
 * same bytes into `dist/` on build, at one URL in both, and stops the bundler
 * from emitting the two wasm files it would otherwise derive from the package.
 *
 * What `node_modules/libfx/browser.js` actually does (lines 14-15, verbatim):
 *
 *     const defaultCoreWasm = new URL("./fx-core.wasm", import.meta.url).href;
 *     const defaultTermWasm = new URL("./fx-term.wasm", import.meta.url).href;
 *
 * Both run at *module scope*, so their cost is not conditional on anyone calling
 * `createFxTerminal()`. Measured, not assumed:
 *
 * - Build: Vite's `assetImportMetaUrl` handling resolves both specifiers and
 *   emits them, rewriting the expressions to root-relative URLs. A build of this
 *   app with `libfx` reachable produced `assets/fx-core-<hash>.wasm` (2,250,031 B)
 *   **and** `assets/fx-term-<hash>.wasm` (4,976,444 B) on top of the copy this
 *   plugin emits. That is 7.2 MB in `dist/` for 2.25 MB the browser ever fetches,
 *   and the terminal binary can never be used: no route in this app mounts one.
 * - Dev (measured with the rewrite below removed): the same expressions resolve
 *   against the installed file and fetch `node_modules/libfx/fx-core.wasm`, a
 *   *second* 2,250,031 B transfer, because a different URL is a different HTTP
 *   cache entry. So the package default is not merely redundant, it is a
 *   duplicated download on every cold cache.
 *
 * The rewrite below drops both module-scope declarations and makes the two
 * *use sites* — `wasm: options.wasm ?? defaultCoreWasm` — throw. It has to be
 * the use site and not the declaration: the declaration is a module-scope
 * initializer, so throwing there breaks `import 'libfx/browser'` itself, and
 * an app whose only wasm path is explicit would be unable to load the module at
 * all. Throwing at the use site keeps the import valid, leaves exactly one wasm
 * in the build and one URL in the app, and gives a caller who forgets `wasm` a
 * named error instead of a 404. `src/lib/fx/runtime.ts` always passes it.
 *
 * If a future libfx release changes those four lines, `transform` fails the
 * build instead of quietly shipping 7.2 MB again.
 *
 * The content type is set explicitly to `application/wasm` because
 * `wasm-module.js#compileModule` only takes the `WebAssembly.compileStreaming`
 * path on that exact media type; anything else silently degrades to
 * `arrayBuffer()` + `compile()`, buffering all 2.25 MB in the JS heap first.
 *
 * The binary is emitted unhashed: the URL is a constant in the app, so a content
 * hash would be a second thing to keep in sync, and it is never `?url` imported
 * so nothing tries to base64 2.25 MB into a JS chunk.
 */
function fxCoreWasm(): Plugin {
  const coreWasmPath = () => join(libfxPackageDir(), 'fx-core.wasm');
  // The two module-scope default declarations in the shipped browser entry.
  const declaration = /const default(Core|Term)Wasm = new URL\("\.\/fx-(core|term)\.wasm", import\.meta\.url\)\.href;/g;
  // The two places those declarations are read.
  const useSite = /options\.wasm \?\? default(Core|Term)Wasm/g;
  const thrower = [
    'function mizpaDefaultWasmDisabled() {',
    '  throw new Error(',
    '    "libfx: Mizpa serves the fx wasm from its own origin. Pass the `wasm` option " +',
    '    "explicitly (see src/lib/fx/runtime.ts); the package default is disabled by " +',
    '    "the fx-core-wasm Vite plugin."',
    '  );',
    '}',
  ].join('\n');

  return {
    name: 'fx-core-wasm',
    // `pre` is load-bearing, not cosmetic. Vite's own `assetImportMetaUrl`
    // handling rewrites `new URL("./fx-core.wasm", import.meta.url)` to
    // `new URL("/node_modules/libfx/fx-core.wasm", import.meta.url)` before a
    // normal-phase transform sees it, so this hook has to run first to find the
    // original text. Verified both ways: without `pre` the rewrite silently did
    // not happen in dev while it did in the build.
    enforce: 'pre',
    // Fail the dev boot and the build loudly rather than at the first fetch.
    buildStart() {
      const bytes = readFileSync(coreWasmPath());
      if (bytes.byteLength === 0) this.error('fx-core.wasm is empty');
    },
    transform(code, id) {
      // In dev Vite appends a `?v=<browserHash>` to the id, so compare on the
      // path part. Getting this wrong is silent: the hook simply never runs and
      // the package defaults come back.
      const [file] = id.split('?');
      if (!file.endsWith('libfx/browser.js')) return null;
      const declarations = code.match(declaration)?.length ?? 0;
      const useSites = code.match(useSite)?.length ?? 0;
      if (declarations !== 2 || useSites !== 2) {
        this.error(
          `fx-core-wasm: ${id} has ${declarations}/2 module-scope wasm defaults and ` +
            `${useSites}/2 of their use sites. A libfx upgrade changed the browser entry. ` +
            'Re-check which wasm assets the build emits before relaxing this: leaving the ' +
            'package defaults in place costs 7.2 MB in dist.',
        );
      }
      return {
        code: `${thrower}\n${code.replace(declaration, '').replace(useSite, 'options.wasm ?? mizpaDefaultWasmDisabled()')}`,
        map: null,
      };
    },
    configureServer(server) {
      server.middlewares.use(FX_CORE_WASM_URL, (_request, response) => {
        const bytes = readFileSync(coreWasmPath());
        response.setHeader('Content-Type', 'application/wasm');
        response.setHeader('Content-Length', String(bytes.byteLength));
        // The bytes are an immutable installed artifact; the dev server should
        // not re-send 2.25 MB on every reload.
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        response.end(bytes);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: FX_CORE_WASM_URL.replace(/^\//, ''),
        source: readFileSync(coreWasmPath()),
      });
    },
  };
}

/**
 * A same-origin relay to the IsAgentReady MCP server.
 *
 * ## Why a relay exists at all
 *
 * `https://isagentready.com` publishes no `Access-Control-Allow-Origin` on any
 * route and answers `OPTIONS /mcp` with 405. Measured 2026-10-02 with
 * `Origin: http://localhost:5173`, against `/mcp` (POST), `/mcp` (OPTIONS),
 * `/api/v1/scan`, `/llms.txt` and `/openapi.json`: **zero** CORS headers, five
 * times. A cross-origin response with no `Access-Control-Allow-Origin` is
 * unreadable by JavaScript no matter how the request is shaped, so a tab cannot
 * reach the scanner directly and a client that tried would fail at the network
 * layer with a bare `TypeError`.
 *
 * ## What this is, precisely
 *
 * A **byte forwarder and nothing else**. It does not speak MCP, does not know the
 * tool names, does not parse a report and holds no session state: it adds
 * `Access-Control-Allow-Origin` and copies the request headers and the response
 * headers back. `mcp-session-id` is in the copied set on purpose — the client in
 * `src/lib/agentready/mcp.ts` reads the session from the response headers, and a
 * relay that dropped it would force the client down a different code path in dev
 * than in production, which is precisely the kind of divergence this repo has
 * been bitten by twice.
 *
 * The *production* answer is an edge function, not a static host: a static host
 * cannot terminate CORS for a third party's origin. Nothing is deployed by this
 * change, so the browser path below is what makes the scanner verifiable now and
 * the edge function is the remaining step. What the tab cannot do is *look* like
 * it worked: with no relay answering, `scan.ts` surfaces
 * `ScanError('unreachable')` and the panel says the scanner was unreachable.
 *
 * ## Why it is in `configureServer` and not `configurePreviewServer` too
 *
 * `npm run preview` serves `dist/`, and the built app calls the same
 * same-origin path. Registering on the preview server too is what lets the
 * production bundle be verified against the real scanner instead of only against
 * the dev server — a build that works in dev and 404s in preview is a bug this
 * plugin would otherwise hide until deploy.
 */
function agentReadyRelay(): Plugin {
  const UPSTREAM = 'https://isagentready.com/mcp';
  /** The one path this relay answers. Nothing else is proxied out of the dev server. */
  const RELAY_PATH = '/api/agentready';
  /** Mirrors `UpstreamRequestSpec` in fx-gateway: the scanner crawls for 30 s. */
  const UPSTREAM_TIMEOUT_MS = 45_000;

  const handler = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): Promise<void> => {
    // MCP is POST-only. Answering GET here rather than falling through keeps the
    // dev server's 404 HTML out of a JSON-RPC client's error path.
    if (request.method !== 'POST') {
      response.statusCode = 405;
      response.setHeader('Allow', 'POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.end();
      return;
    }

    const chunks: Buffer[] = [];
    let received = 0;
    try {
      for await (const chunk of request) {
        const buffer = chunk as Buffer;
        received += buffer.byteLength;
        // A JSON-RPC envelope is a few KB. The cap stops this dev middleware
        // from being an unbounded upload buffer for anything that finds the path.
        if (received > 1024 * 1024) {
          response.statusCode = 413;
          response.end('payload too large');
          return;
        }
        chunks.push(buffer);
      }
    } catch (error) {
      response.statusCode = 400;
      response.end(error instanceof Error ? error.message : 'unreadable body');
      return;
    }

    // Only what the MCP transport is defined to send. A dev server that echoed
    // the browser's cookie or `authorization` header to a third party would be a
    // worse bug than the one this plugin exists to solve.
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const session = request.headers['mcp-session-id'];
    if (typeof session === 'string' && session !== '') headers['mcp-session-id'] = session;

    try {
      const upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers,
        body: Buffer.concat(chunks).toString('utf8'),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      response.statusCode = upstream.status;
      response.setHeader('Access-Control-Allow-Origin', '*');
      // The session travels in the response headers, so it has to survive the
      // relay or the client re-initialises on every single call.
      const upstreamSession = upstream.headers.get('mcp-session-id');
      if (upstreamSession !== null) response.setHeader('mcp-session-id', upstreamSession);
      const contentType = upstream.headers.get('content-type');
      if (contentType !== null) response.setHeader('content-type', contentType);
      // The scanner caps itself at 100 requests an hour per IP and says when the
      // budget refills (`retry-after`, `ratelimit-remaining`). Forwarding those
      // is what lets the UI say "try again in 38 minutes" instead of a bare
      // "too many requests" the visitor can do nothing about. Measured 429.
      for (const name of ['retry-after', 'ratelimit', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'] as const) {
        const value = upstream.headers.get(name);
        if (value !== null) response.setHeader(name, value);
      }
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      // A relay that answers nothing leaves the client with a network-level
      // failure, which it reports as `unreachable`. A relay that answers 502 with
      // a body is easier to read in the dev server's own log.
      const name = (error as { name?: string } | null)?.name;
      const timedOut = name === 'TimeoutError' || name === 'AbortError';
      response.statusCode = timedOut ? 504 : 502;
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          error: timedOut ? 'isagentready did not answer in time' : 'isagentready is unreachable',
          relay: true,
        }),
      );
    }
  };

  return {
    name: 'agent-ready-relay',
    configureServer(server) {
      server.middlewares.use(RELAY_PATH, (request, response, next) => {
        if (request.method === 'OPTIONS') {
          response.statusCode = 204;
          response.setHeader('Access-Control-Allow-Origin', '*');
          response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'content-type, accept, mcp-session-id');
          response.end();
          return;
        }
        void handler(request, response, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(RELAY_PATH, (request, response) => {
        if (request.method === 'OPTIONS') {
          response.statusCode = 204;
          response.setHeader('Access-Control-Allow-Origin', '*');
          response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'content-type, accept, mcp-session-id');
          response.end();
          return;
        }
        void handler(request, response, () => undefined);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fxCoreWasm(), agentReadyRelay()],
  // `libfx` ships ESM and does its own relative asset resolution. Excluding it
  // from pre-bundling is what lets the `transform` above see the original
  // `new URL("./fx-*.wasm", ...)` text in dev: esbuild would otherwise collapse
  // the package into one chunk under `node_modules/.vite/deps` first. The app
  // does not depend on this for the wasm path — it passes `wasm` explicitly —
  // it depends on it so the package's dead defaults stay dead in dev exactly as
  // they are in the build. Dev and build must not disagree about this.
  optimizeDeps: { exclude: ['libfx'] },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
