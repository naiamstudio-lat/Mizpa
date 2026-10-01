import { expect, test } from '@playwright/test';
import { readJspiReport } from '../fixtures/jspi';

// U1 spike (tasks 1.1): settle the headless-Chromium JSPI question before any
// fx E2E is written.
//
// Verified on this harness — Playwright 1.62.1 / Chromium 151.0.7922.34:
//   * JSPI is on by default (shipped from Chromium 137), and this V8 build has
//     no `--jspi` flag: `--js-flags=--help` lists none.
//   * Node 24.14 is the opposite — both symbols are undefined until
//     `--experimental-wasm-jspi` is passed. That flag belongs to the future
//     `src/lib/fx/*` unit layer, not to this browser layer.
// So the gate is a capability probe, and `playwright.config.ts` passes no JSPI
// flag on purpose.

test.describe('JSPI gate', () => {
  test('headless chromium exposes the shipped JSPI surface with no extra flag', async ({ page }) => {
    await page.goto('/');

    const report = await readJspiReport(page);

    expect(report.types).toEqual({ Suspending: 'function', promising: 'function' });
    expect(report.supported).toBe(true);
  });

  test('the probe is not vacuous when the JSPI surface is removed', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      delete (WebAssembly as unknown as Record<string, unknown>).Suspending;
      delete (WebAssembly as unknown as Record<string, unknown>).promising;
    });
    const page = await context.newPage();
    await page.goto('/');

    const report = await readJspiReport(page);

    expect(report.types).toEqual({ Suspending: 'undefined', promising: 'undefined' });
    expect(report.supported).toBe(false);

    await context.close();
  });
});