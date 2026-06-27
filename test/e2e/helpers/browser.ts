import puppeteer, { type Browser, type Page } from 'puppeteer';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS !== 'false';

export interface TestContext {
  browser: Browser;
  page: Page;
}

export async function setupBrowser(): Promise<TestContext> {
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    executablePath: '/home/codespace/.cache/puppeteer/chrome/linux-120.0.6099.109/chrome-linux64/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-translate',
      '--disable-extensions',
    ],
  });

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

export const TEST_USER = {
  email: 'test@mizpa.dev',
  password: 'Test123456',
};
