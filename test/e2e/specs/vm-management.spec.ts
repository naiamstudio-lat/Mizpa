import type { TestSuite } from '../helpers/runner';
import { LoginPage } from '../pages';
import { getTestUserConfig } from '../helpers/browser';

const TEST_USER = getTestUserConfig();

/**
 * VM Management tests (scaffold)
 *
 * These tests are a scaffold for validating the lifecycle and resource
 * optimization rules for VMs launched by the `freestyle` flow. They are
 * intentionally marked as skipped until we wire mocks/observability into
 * the runtime (or expose an API to query VM state).
 *
 * Next steps:
 * - Add instrumentation or a test-only API in the VM manager to assert state.
 * - Implement helpers in `test/e2e/helpers/vm.ts` to query VM lifecycle.
 * - Remove `skip: true` when the infra for assertions exists.
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
        // TODO: implement using test helper to trigger a freestyle job and assert VM requested
        throw new Error('Not implemented: requires VM manager test hook');
      },
    },
    {
      name: 'VM is destroyed after task completion to free resources',
      skip: true,
      fn: async (ctx) => {
        // TODO: implement
        throw new Error('Not implemented: requires VM manager test hook');
      },
    },
    {
      name: 'VMs are isolated between users (no data bleed)',
      skip: true,
      fn: async (ctx) => {
        // TODO: implement multi-user simulation and verify isolation
        throw new Error('Not implemented: requires test harness for multi-user flows');
      },
    },
    {
      name: 'Resource optimization rules are applied (scale down idle VMs)',
      skip: true,
      fn: async (ctx) => {
        // TODO: implement resource/idle simulation and probe optimizer decisions
        throw new Error('Not implemented: requires VM metrics and optimizer hooks');
      },
    },
  ],
};
