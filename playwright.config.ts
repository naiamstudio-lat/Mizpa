import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright harness for Mizpa.
 *
 * Setup (Linux, once per machine):
 *   npx playwright install --with-deps chromium
 *
 * Env:
 *   HEADLESS=false  run with a visible browser window.
 *   CI=1            enable retries, forbid `.only`, and add the HTML reporter.
 *
 * JSPI spike result (U1, tasks 1.1) — headless Chromium needs no JSPI flag.
 * Playwright 1.62.1 ships Chromium 151.0.7922.34, where JSPI is enabled by
 * default; its V8 flag list (`--js-flags=--help`) contains no `--jspi`. The gate
 * is therefore a capability probe on `WebAssembly.Suspending` +
 * `WebAssembly.promising`, asserted in `test/e2e/jspi.spec.ts`. The only JSPI
 * flag in the toolchain is Node's `--experimental-wasm-jspi`, needed by the
 * future `src/lib/fx/*` unit layer, not by this browser layer.
 */

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_500 },

  use: {
    baseURL: BASE_URL,
    headless: process.env.HEADLESS !== 'false',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Full Chromium in new headless mode: the closest build to the Chrome 137+
      // baseline the JSPI gate requires. `chromium-headless-shell` also passes
      // the gate, but it is a stripped build that we do not ship to users.
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Always boot our own server: reusing an already-running `npm run dev`
    // would attach to a process without the placeholder Supabase env below and
    // fail as if the app were broken. `--strictPort` turns a port clash into a
    // loud error instead of that silent misconfiguration.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // `src/lib/supabase.ts` calls createClient at module scope and throws
      // "supabaseUrl is required." without these, which blanks every route.
      // Placeholders are safe: an empty auth store resolves from storage only and
      // never reaches the network, and the harness asserts no signed-in state.
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'placeholder-publishable-key',
    },
  },
});