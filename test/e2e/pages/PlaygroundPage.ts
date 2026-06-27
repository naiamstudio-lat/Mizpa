import type { Page } from 'puppeteer';

export class PlaygroundPage {
  constructor(private page: Page) {}

  async goto(skill?: string) {
    const url = skill
      ? `http://localhost:5173/playground?skill=${skill}`
      : 'http://localhost:5173/playground';
    await this.page.goto(url, { waitUntil: 'networkidle0' });
  }

  async typeUrl(url: string) {
    await this.page.type('input[type="text"]', url);
  }

  async clickSend() {
    await this.page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.includes('Enviar')) {
          btn.click();
          return;
        }
      }
    });
  }

  async getMessages(): Promise<string[]> {
    return this.page.evaluate(() => {
      const msgs: string[] = [];
      const elements = document.querySelectorAll('[class*="rounded-2xl"]');
      for (const el of elements) {
        const text = el.textContent || '';
        if (text.length > 10) {
          msgs.push(text);
        }
      }
      return msgs;
    });
  }

  async getLastMessage(): Promise<string> {
    const msgs = await this.getMessages();
    return msgs[msgs.length - 1] || '';
  }

  async isTypingIndicatorVisible(): Promise<boolean> {
    return this.page.evaluate(() => {
      return document.querySelector('.animate-bounce') !== null;
    });
  }

  async isLoaded(): Promise<boolean> {
    return this.page.evaluate(() => {
      return document.querySelector('input[type="text"]') !== null;
    });
  }
}
