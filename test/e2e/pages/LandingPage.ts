import type { Page } from 'puppeteer';

export class LandingPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async getHeroText(): Promise<string> {
    return this.page.$eval('h1', el => el.textContent || '');
  }

  async clickLogin() {
    await this.page.click('a[href="/login"]');
    await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
  }

  async clickPlayground() {
    await this.page.click('a[href="/playground"]');
    await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
  }

  async isLoaded(): Promise<boolean> {
    return this.page.$('h1') !== null;
  }
}
