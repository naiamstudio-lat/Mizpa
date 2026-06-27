import type { Page } from 'puppeteer';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
  }

  async fillEmail(email: string) {
    await this.page.type('input[type="email"]', email);
  }

  async fillPassword(password: string) {
    await this.page.type('input[type="password"]', password);
  }

  async clickSubmit() {
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle0' }),
      this.page.click('button[type="submit"]'),
    ]);
  }

  async login(email: string, password: string) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickSubmit();
  }

  async getErrorMessage(): Promise<string | null> {
    return this.page.evaluate(() => {
      const el = document.querySelector('.text-red-400');
      return el ? el.textContent || '' : null;
    });
  }

  async isLoaded(): Promise<boolean> {
    return this.page.evaluate(() => {
      return document.querySelector('input[type="email"]') !== null;
    });
  }
}
