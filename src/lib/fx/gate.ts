/**
 * The JSPI capability gate.
 *
 * `fx-core.wasm` is a suspending wasm module: `fx-sdk.js` imports it through
 * `new WebAssembly.Suspending(...)` and starts it with
 * `WebAssembly.promising(instance.exports._start)`. Without JSPI there is no
 * way to instantiate it, so the one question that decides whether the in-tab
 * agent can exist at all is "does this JavaScript realm have JSPI?".
 *
 * The probe is those two symbols and nothing else. Two things it deliberately
 * is not:
 *
 * - Not a user-agent or version check. JSPI is a runtime capability, it has
 *   shipped unflagged in Chromium since 137, and a version check is wrong the
 *   day a browser forks it. libfx's own `supportsJspi()` checks exactly these
 *   two properties.
 * - Not `WebAssembly.Function`. That proposal never reached the 151 build that
 *   Playwright ships, so probing it reports `unsupported` on a browser that can
 *   actually run the agent.
 *
 * WHERE THIS MUST RUN: inside the page. A Playwright spec that calls
 * `probeJspi()` from the test process reads *Node's* `globalThis.WebAssembly`,
 * where `Suspending` and `promising` are `undefined` until Node is started with
 * `--experimental-wasm-jspi`. Every assertion about this gate therefore has to
 * happen in the page realm, and that is exactly how the browser verification for
 * this change reads it.
 *
 * The gate never fetches the wasm and never imports `libfx`, so an unsupported
 * browser pays nothing for this module.
 */

declare global {
  namespace WebAssembly {
    /**
     * JSPI. Not present in TypeScript 5.8's `lib.dom.d.ts`, and not gated
     * behind a lib name here because the app has no other WebAssembly use.
     */
    type JspiWrapper = {
      new <T>(fn: T): T;
      <T>(fn: T): T;
    };
    const Suspending: JspiWrapper;
    const promising: JspiWrapper;
  }
}

/**
 * The three states, and no fourth. A fourth "falling back to something else"
 * state is the trap this replaces: there is no other runtime, so a browser that
 * fails the gate is an honest `unsupported`, not a degraded mode.
 *
 * - `ready` — JSPI is here. The wasm can be fetched and compiled.
 * - `unsupported` — JSPI is absent. The wasm can never run in this browser.
 *   Nothing is downloaded and `libfx` is never imported.
 * - `unavailable` — JSPI said yes but the runtime could not be loaded anyway:
 *   the module graph broke, the wasm asset 404'd, or it failed to compile.
 *   That is an error to report, not a browser limitation.
 */
export type FxGateState = 'ready' | 'unsupported' | 'unavailable';

export interface FxJspiProbe {
  suspending: boolean;
  promising: boolean;
}

export interface FxGateReport {
  state: FxGateState;
  jspi: FxJspiProbe;
  /** One short sentence, safe to show a user verbatim. */
  detail: string;
}

/** Read the two symbols. Must be called from the realm whose JSPI matters. */
export function probeJspi(): FxJspiProbe {
  return {
    suspending: typeof WebAssembly.Suspending === 'function',
    promising: typeof WebAssembly.promising === 'function',
  };
}

export function jspiAvailable(probe: FxJspiProbe = probeJspi()): boolean {
  return probe.suspending && probe.promising;
}

export function gateForJspi(probe: FxJspiProbe = probeJspi()): FxGateReport {
  if (jspiAvailable(probe)) {
    return { state: 'ready', jspi: probe, detail: 'This browser can run the fx agent.' };
  }
  const missing = [probe.suspending ? null : 'WebAssembly.Suspending', probe.promising ? null : 'WebAssembly.promising']
    .filter((symbol) => symbol !== null)
    .join(' and ');
  return {
    state: 'unsupported',
    jspi: probe,
    detail: `This browser is missing ${missing}, which the fx agent requires.`,
  };
}

export function unavailableReport(reason: string, probe: FxJspiProbe = probeJspi()): FxGateReport {
  return { state: 'unavailable', jspi: probe, detail: reason };
}
