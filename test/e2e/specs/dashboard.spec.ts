import type { TestSuite } from '../helpers/runner';
import { LoginPage, DashboardPage } from '../pages';
import { getTestUserConfig } from '../helpers/browser';

const TEST_USER = getTestUserConfig();

export const dashboardSuite: TestSuite = {
  name: 'Dashboard Navigation',

  beforeEach: async (ctx) => {
    // Ensure authenticated
    const loginPage = new LoginPage(ctx.page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);

    // Wait for dashboard
    await ctx.page.waitForFunction(
      () => window.location.pathname === '/dashboard',
      { timeout: 10000 }
    );
  },

  tests: [
    {
      name: 'dashboard displays welcome message',
      fn: async (ctx) => {
        const dashboard = new DashboardPage(ctx.page);
        await dashboard.goto();

        const title = await dashboard.getTitle();
        if (!title.includes('Dashboard')) {
          throw new Error(`Expected title to contain "Dashboard", got "${title}"`);
        }
      },
    },
    {
      name: 'dashboard shows three skill cards',
      fn: async (ctx) => {
        const dashboard = new DashboardPage(ctx.page);
        await dashboard.goto();

        const cards = await dashboard.getSkillCards();
        if (cards.length !== 3) {
          throw new Error(`Expected 3 skill cards, got ${cards.length}`);
        }
      },
    },
    {
      name: 'clicking audit card navigates to playground with skill=audit',
      fn: async (ctx) => {
        const dashboard = new DashboardPage(ctx.page);
        await dashboard.goto();
        await dashboard.clickSkillCard('audit');

        // Wait for navigation
        await ctx.page.waitForFunction(
          () => window.location.pathname === '/playground' && window.location.search.includes('skill=audit'),
          { timeout: 10000 }
        );

        const url = ctx.page.url();
        if (!url.includes('/playground?skill=audit')) {
          throw new Error(`Expected /playground?skill=audit, got ${url}`);
        }
      },
    },
    {
      name: 'clicking replica card navigates to playground with skill=replica',
      fn: async (ctx) => {
        const dashboard = new DashboardPage(ctx.page);
        await dashboard.goto();
        await dashboard.clickSkillCard('replica');

        // Wait for navigation
        await ctx.page.waitForFunction(
          () => window.location.pathname === '/playground' && window.location.search.includes('skill=replica'),
          { timeout: 10000 }
        );

        const url = ctx.page.url();
        if (!url.includes('/playground?skill=replica')) {
          throw new Error(`Expected /playground?skill=replica, got ${url}`);
        }
      },
    },
    {
      name: 'clicking generate card navigates to playground with skill=generate',
      fn: async (ctx) => {
        const dashboard = new DashboardPage(ctx.page);
        await dashboard.goto();
        await dashboard.clickSkillCard('generate');

        // Wait for navigation
        await ctx.page.waitForFunction(
          () => window.location.pathname === '/playground' && window.location.search.includes('skill=generate'),
          { timeout: 10000 }
        );

        const url = ctx.page.url();
        if (!url.includes('/playground?skill=generate')) {
          throw new Error(`Expected /playground?skill=generate, got ${url}`);
        }
      },
    },
  ],
};
