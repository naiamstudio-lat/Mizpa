/**
 * Loading the fx runtime in a browser tab.
 *
 * This module is the only place that knows how the wasm binary reaches the
 * browser, and it is intentionally the *only* one: the rest of the app asks
 * `bootstrapFxAgent()` for a verdict and an agent.
 *
 * Two decisions live here, and both come from the shipped code.
 *
 * **The wasm URL is explicit.** `node_modules/libfx/browser.js` computes
 * `new URL("./fx-core.wasm", import.meta.url).href` at *module scope*. That
 * expression only resolves to the real asset if `import.meta.url` is still the
 * installed file inside `node_modules`; the moment a bundler rewrites or
 * pre-bundles the module, the URL points somewhere else. `createFxAgent()`
 * accepts a `wasm` option, so this module always passes one and the module-level
 * default never runs. See `vite.config.ts#fxCoreWasm` for the other half: the
 * server that hands the bytes over.
 *
 * **Nothing is imported until the gate passes.** `libfx/browser` is behind a
 * dynamic `import()`, so a browser without JSPI downloads neither the 2.25 MB
 * wasm nor the 84 KB SDK, and the shipped SDK does not fetch the wasm at import
 * time either — the fetch happens inside `WebAssembly.instantiate`, which only
 * runs once an agent is actually created.
 */

import {
  gateForJspi,
  probeJspi,
  unavailableReport,
  type FxGateReport,
  type FxGateState,
} from './gate';
import type { FxAgent, FxAgentOptions } from 'libfx/browser';

/** Where the Vite plugin serves and emits the binary. Must match both. */
export const FX_CORE_WASM_PATH = 'fx/fx-core.wasm';

/**
 * Same-origin, absolute, and under the configured base so a build served from a
 * sub-path still finds it. `browser.js` needs a string, never a `URL` object —
 * `wasm-module.js#compileModule` only string-checks with `typeof input ===
 * "string"`, and a `URL` falls through to the TypeError.
 */
export function fxCoreWasmUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${FX_CORE_WASM_PATH}`;
}

export type FxBootstrap =
  | { state: 'ready'; report: FxGateReport; agent: FxAgent; libfxApiVersion: number }
  | { state: Exclude<FxGateState, 'ready'>; report: FxGateReport };

export interface FxRuntimeInfo {
  /** The URL handed to `createFxAgent({ wasm })`. */
  wasmUrl: string;
  /** `libfx` and `libfx/browser` from the package's `exports` map. */
  libfxApiVersion: number;
  fxSdkApiVersion: number;
  /** The SDK's own verdict, next to ours, so a disagreement is visible. */
  libfxSupportsJspi: boolean;
}

/**
 * Load the SDK. Separate from `bootstrapFxAgent` so the caller can report the
 * module graph and the API version without paying for a wasm fetch — and so a
 * failure here is distinguishable from a wasm failure there.
 */
export async function loadFxRuntime(): Promise<FxRuntimeInfo> {
  const mod = await import('libfx/browser');
  return {
    wasmUrl: fxCoreWasmUrl(),
    libfxApiVersion: mod.libfxApiVersion,
    fxSdkApiVersion: mod.fxSdkApiVersion,
    libfxSupportsJspi: mod.supportsJspi(),
  };
}

/**
 * Gate, then load, then create.
 *
 * The `unavailable` cases are all real and each one is a different bug to fix,
 * so they are reported with the underlying message rather than flattened into
 * one "something went wrong".
 */
export async function bootstrapFxAgent(options: FxAgentOptions = { apiKey: 'unavailable' }): Promise<FxBootstrap> {
  const gated = gateForJspi();
  if (gated.state !== 'ready') return { state: gated.state, report: gated };

  let info: FxRuntimeInfo;
  try {
    info = await loadFxRuntime();
  } catch (error) {
    return {
      state: 'unavailable',
      report: unavailableReport(`The fx runtime could not be loaded: ${message(error)}`),
    };
  }

  // Our probe and libfx's must agree. If they do not, something replaced the
  // global mid-flight and neither verdict can be trusted.
  if (info.libfxSupportsJspi !== (gated.jspi.suspending && gated.jspi.promising)) {
    return {
      state: 'unavailable',
      report: unavailableReport('The fx runtime disagrees with this browser about JSPI support.'),
    };
  }

  try {
    const { createFxAgent } = await import('libfx/browser');
    const agent = await createFxAgent({ ...options, wasm: info.wasmUrl });
    return { state: 'ready', report: gated, agent, libfxApiVersion: info.libfxApiVersion };
  } catch (error) {
    return {
      state: 'unavailable',
      report: unavailableReport(`The fx agent could not start: ${message(error)}`),
    };
  }
}

/** A `HEAD` on the wasm, so a missing asset is `unavailable` before a 2.25 MB download. */
export async function fxCoreAssetStatus(): Promise<{ ok: boolean; bytes: number | null; contentType: string | null }> {
  try {
    const response = await fetch(fxCoreWasmUrl(), { method: 'HEAD' });
    const declared = Number(response.headers.get('content-length'));
    return {
      ok: response.ok,
      bytes: Number.isFinite(declared) ? declared : null,
      contentType: response.headers.get('content-type'),
    };
  } catch (error) {
    return { ok: false, bytes: null, contentType: null };
  }
}

export { probeJspi };
export type { FxGateReport, FxGateState };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
