import type { TestSuite } from '../helpers/runner';
import { LoginPage, PlaygroundPage } from '../pages';
import { getTestUserConfig } from '../helpers/browser';

const TEST_USER = getTestUserConfig();

export const playgroundSuite: TestSuite = {
  name: 'Playground Skill Selection',

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
      name: 'playground loads with skill selector',
      fn: async (ctx) => {
        const playground = new PlaygroundPage(ctx.page);
        await playground.goto();

        // Wait for page to fully render
        await new Promise(r => setTimeout(r, 2000));

        // Check URL is still playground (not redirected to login)
        const url = ctx.page.url();
        if (!url.includes('/playground')) {
          throw new Error(`Expected to be on playground, got ${url}`);
        }

        // Check page has some content
        const hasContent = await ctx.page.evaluate(() => {
          return document.body.innerHTML.length > 100;
        });
        if (!hasContent) throw new Error('Playground page is empty');
      },
    },
    {
      name: 'playground pre-selects skill from query param',
      fn: async (ctx) => {
        const playground = new PlaygroundPage(ctx.page);
        await playground.goto('replica');

        // Check URL has skill param
        const url = ctx.page.url();
        if (!url.includes('skill=replica')) {
          throw new Error(`Expected skill=replica in URL, got ${url}`);
        }

        // Check input placeholder indicates skill is loaded
        const placeholder = await ctx.page.$eval('input[type="text"]', el =>
          el.getAttribute('placeholder') || ''
        );
        if (!placeholder.includes('URL')) {
          throw new Error(`Expected URL placeholder, got "${placeholder}"`);
        }
      },
    },
    {
      name: 'clicking skill button updates placeholder',
      fn: async (ctx) => {
        const playground = new PlaygroundPage(ctx.page);
        await playground.goto();

        // Use evaluate to click and wait for React to update
        await ctx.page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.textContent?.toLowerCase().includes('auditoría')) {
              btn.click();
              break;
            }
          }
        });

        // Wait for React state update
        await new Promise(r => setTimeout(r, 500));

        // Verify input placeholder changed
        const placeholder = await ctx.page.$eval('input[type="text"]', el =>
          el.getAttribute('placeholder') || ''
        );
        if (!placeholder.includes('auditar')) {
          throw new Error(`Expected audit placeholder, got "${placeholder}"`);
        }
      },
    },
    {
      name: 'chat input shows correct placeholder for replica skill',
      fn: async (ctx) => {
        const playground = new PlaygroundPage(ctx.page);
        await playground.goto('replica');

        const placeholder = await ctx.page.$eval('input[type="text"]', el =>
          el.getAttribute('placeholder') || ''
        );

        if (!placeholder.includes('URL')) {
          throw new Error(`Expected placeholder with "URL", got "${placeholder}"`);
        }
      },
    },
    {
      name: 'welcome message appears for audit skill',
      fn: async (ctx) => {
        const playground = new PlaygroundPage(ctx.page);
        await playground.goto('audit');

        // Wait for page to fully load
        await ctx.page.waitForSelector('input[type="text"]', { timeout: 5000 });

        // Wait for messages to load
        await ctx.page.waitForFunction(
          () => {
            const msgs = document.querySelectorAll('[class*="rounded-2xl"]');
            return msgs.length > 0;
          },
          { timeout: 5000 }
        );

        // Small delay to ensure DOM is stable
        await new Promise(r => setTimeout(r, 300));

        const messages = await playground.getMessages();
        if (messages.length === 0) throw new Error('No welcome message');

        const welcome = messages[0];
        if (!welcome.includes('Auditoría')) {
          throw new Error(`Welcome message doesn't mention skill, got "${welcome.substring(0, 100)}"`);
        }
      },
    },
  ],
};
