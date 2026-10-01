import type { Page } from '@playwright/test';

/**
 * JSPI capability probe for the Playwright harness.
 *
 * Mirrors libfx's own `supportsJspi()`: JSPI is available when the runtime
 * exposes `WebAssembly.Suspending` and `WebAssembly.promising`. Feature-detect
 * instead of sniffing the user-agent version, and never depend on a browser
 * flag: JSPI ships enabled by default from Chromium 137 on.
 *
 * The probe must run *inside the page* — the symbols do not exist on Node's
 * `globalThis.WebAssembly`, so evaluating it in the test process would answer a
 * different question.
 */

/** Symbols that must be present, each a function, for the fx runtime to boot. */
export const JSPI_SYMBOLS = ['Suspending', 'promising'] as const;

export type JspiReport = {
  supported: boolean;
  types: Record<string, string>;
};

/** Read the JSPI surface of `page`'s realm. */
export async function readJspiReport(page: Page): Promise<JspiReport> {
  return page.evaluate((symbols) => {
    const wasm = WebAssembly as unknown as Record<string, unknown>;
    const types = Object.fromEntries(symbols.map((name) => [name, typeof wasm[name]]));
    return { supported: symbols.every((name) => types[name] === 'function'), types };
  }, [...JSPI_SYMBOLS]);
}