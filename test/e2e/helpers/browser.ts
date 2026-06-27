import puppeteer, { type Browser, type Page } from 'puppeteer';
import { getBaseUrl } from './config';

const BASE_URL = getBaseUrl();
const HEADLESS = process.env.HEADLESS !== 'false';

export interface TestContext {
  browser: Browser;
  page: Page;
}

export async function setupBrowser(): Promise<TestContext> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const launchOptions: Record<string, unknown> = {
    headless: HEADLESS ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-translate',
      '--disable-extensions',
    ],
  };

  if (executablePath) {
    try {
      const exists = await import('fs/promises').then(({ access }) => access(executablePath));
      launchOptions.executablePath = executablePath;
    } catch {
      console.warn(`PUPPETEER_EXECUTABLE_PATH=${executablePath} is not accessible; falling back to bundled browser.`);
    }
  }

  const browser = await puppeteer.launch(launchOptions);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  return { browser, page };
}

export async function teardownBrowser(ctx: TestContext) {
  await ctx.browser.close();
}

export async function navigateTo(ctx: TestContext, path: string) {
  await ctx.page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle0' });
}

export async function waitForSelector(ctx: TestContext, selector: string, timeout = 5000) {
  await ctx.page.waitForSelector(selector, { timeout });
}

export async function screenshot(ctx: TestContext, name: string) {
  const path = `test/e2e/screenshots/${name}.png`;
  await ctx.page.screenshot({ path, fullPage: true });
  return path;
}

export { getTestUser as getTestUserConfig } from './config';
