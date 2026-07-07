import type { TestSuite } from '../helpers/runner';
import { LoginPage, DashboardPage } from '../pages';
import { getTestUserConfig } from '../helpers/browser';

const TEST_USER = getTestUserConfig();

/**
 * VM Management E2E tests
 *
 * These tests require Supabase API access from the test browser (DNS resolution
 * of supabase.co must work). They are skipped by default in the main `run.ts`
 * because sandboxed CI environments often block external DNS.
 *
 * Run separately when network is available:
 *   npx tsx -e "import {runSuite,printSummary} from './helpers/runner'; ..."
 *
 * For infrastructure-level testing (no browser needed), see:
 *   test/backend/cleanup-vms.test.ts
 */

export const vmManagementSuite: TestSuite = {
  name: 'VM Management & Resource Optimization',

  beforeEach: async (ctx) => {
    const loginPage = new LoginPage(ctx.page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await ctx.page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 10000 });
  },

  tests: [
    {
      name: 'VM requested when freestyle task is created',
      skip: true,
      fn: async (ctx) => {
        throw new Error('Not implemented: requires VM manager test hook');
      },
    },
    {
      name: 'VM is destroyed after task completion to free resources',
      skip: true,
      fn: async (ctx) => {
        throw new Error('Not implemented: requires VM manager test hook');
      },
    },
    {
      name: 'VMs are isolated between users (no data bleed)',
      skip: true,
      fn: async (ctx) => {
        throw new Error('Not implemented: requires test harness for multi-user flows');
      },
    },
    {
      name: 'Resource optimization rules are applied (scale down idle VMs)',
      skip: true,
      fn: async (ctx) => {
        throw new Error('Not implemented: requires VM metrics and optimizer hooks');
      },
    },
    {
      name: 'Dashboard shows cleanup VM button',
      skip: true,
      fn: async (ctx) => {
        const dashboard = new DashboardPage(ctx.page);
        const hasButton = await dashboard.hasCleanupButton();
        if (!hasButton) throw new Error('Cleanup VM button not found on dashboard');
      },
    },
    {
      name: 'Cleanup action does not break dashboard',
      skip: true,
      fn: async (ctx) => {
        const dashboard = new DashboardPage(ctx.page);
        await dashboard.clickCleanup();
        // Wait then navigate to playground
        await new Promise(r => setTimeout(r, 2000));
        await ctx.page.goto('http://localhost:5173/playground?skill=audit', { waitUntil: 'networkidle0' });
        const url = ctx.page.url();
        if (!url.includes('playground')) throw new Error(`Expected playground URL, got: ${url}`);
      },
    },
  ],
};
