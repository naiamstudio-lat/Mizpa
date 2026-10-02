import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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

export default defineConfig({
  plugins: [react(), fxCoreWasm()],
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
