import type { TestSuite } from '../helpers/runner';
import { LoginPage, DashboardPage } from '../pages';
import { TEST_USER } from '../helpers/browser';

export const authSuite: TestSuite = {
  name: 'Authentication Flow',

  tests: [
    {
      name: 'login page renders correctly',
      fn: async (ctx) => {
        const loginPage = new LoginPage(ctx.page);
        await loginPage.goto();

        const isLoaded = await loginPage.isLoaded();
        if (!isLoaded) throw new Error('Login page did not load');

        const emailInput = await ctx.page.$('input[type="email"]');
        if (!emailInput) throw new Error('Email input not found');

        const passwordInput = await ctx.page.$('input[type="password"]');
        if (!passwordInput) throw new Error('Password input not found');
      },
    },
    {
      name: 'login with valid credentials redirects to dashboard',
      fn: async (ctx) => {
        const loginPage = new LoginPage(ctx.page);
        await loginPage.goto();
        await loginPage.login(TEST_USER.email, TEST_USER.password);

        // Wait for navigation to complete
        await ctx.page.waitForFunction(
          () => window.location.pathname === '/dashboard',
          { timeout: 10000 }
        );

        const url = ctx.page.url();
        if (!url.includes('/dashboard')) {
          throw new Error(`Expected redirect to /dashboard, got ${url}`);
        }
      },
    },
    {
      name: 'dashboard shows user email after login',
      fn: async (ctx) => {
        const dashboard = new DashboardPage(ctx.page);
        await dashboard.goto();

        const email = await dashboard.getUserEmail();
        if (!email?.includes(TEST_USER.email)) {
          throw new Error(`Expected email ${TEST_USER.email}, got ${email}`);
        }
      },
    },
    {
      name: 'protected route redirects to login when not authenticated',
      fn: async (ctx) => {
        // Clear auth state
        await ctx.page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });

        // Navigate to dashboard - should redirect to login
        await ctx.page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });

        // Check URL is login (redirect may have already happened)
        const url = ctx.page.url();
        if (!url.includes('/login')) {
          throw new Error(`Expected redirect to /login, got ${url}`);
        }
      },
    },
    {
      name: 'logout clears session and redirects to home',
      fn: async (ctx) => {
        // Login first
        const loginPage = new LoginPage(ctx.page);
        await loginPage.goto();
        await loginPage.login(TEST_USER.email, TEST_USER.password);

        // Wait for dashboard
        await ctx.page.waitForFunction(
          () => window.location.pathname === '/dashboard',
          { timeout: 10000 }
        );

        // Click sign out
        const dashboard = new DashboardPage(ctx.page);
        await dashboard.clickSignOut();

        // Small delay to ensure navigation completes
        await new Promise(r => setTimeout(r, 1000));

        const url = ctx.page.url();
        if (url.includes('/dashboard')) {
          throw new Error('Still on dashboard after sign out');
        }
      },
    },
  ],
};
