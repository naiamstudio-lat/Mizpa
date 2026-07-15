import type { Page } from 'puppeteer';
import { getBaseUrl } from '../helpers/config';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(`${getBaseUrl()}/dashboard`, { waitUntil: 'networkidle0' });
  }

  async getTitle(): Promise<string> {
    return this.page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.textContent || '' : '';
    });
  }

  async getUserEmail(): Promise<string | null> {
    return this.page.evaluate(() => {
      const el = document.querySelector('nav span.text-sm');
      return el ? el.textContent || '' : null;
    });
  }

  async clickSkillCard(skill: 'audit' | 'replica' | 'generate') {
    await this.page.evaluate((s) => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent || '';
        const lower = text.toLowerCase();
        if (
          (s === 'audit' && lower.includes('auditoría')) ||
          (s === 'replica' && lower.includes('réplica')) ||
          (s === 'generate' && lower.includes('generar'))
        ) {
          btn.click();
          return;
        }
      }
      throw new Error(`Skill card "${s}" not found`);
    }, skill);

    // Wait for URL to change (navigation completes)
    await this.page.waitForFunction(
      (expectedPath) => window.location.pathname === expectedPath,
      { timeout: 10000 },
      '/playground'
    );
  }

  async getSkillCards(): Promise<string[]> {
    return this.page.evaluate(() => {
      const cards = document.querySelectorAll('button h3');
      const texts: string[] = [];
      for (const card of cards) {
        const text = card.textContent || '';
        if (text) texts.push(text);
      }
      return texts;
    });
  }

  async clickSignOut() {
    await this.page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent || '';
        if (text.includes('Cerrar')) {
          btn.click();
          return;
        }
      }
    });

    await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
  }

  async isLoaded(): Promise<boolean> {
    return this.page.evaluate(() => {
      return document.querySelector('h1') !== null;
    });
  }

  async hasCleanupButton(): Promise<boolean> {
    return this.page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.includes('Limpiar VMs inactivas')) return true;
      }
      return false;
    });
  }

  async clickCleanup(): Promise<void> {
    await this.page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.includes('Limpiar VMs inactivas')) {
          btn.click();
          return;
        }
      }
      throw new Error('Cleanup button not found');
    });
  }

  async getCleanupMessage(): Promise<string | null> {
    // Wait for the result message to appear (up to 10s polling)
    for (let i = 0; i < 20; i++) {
      const result = await this.page.evaluate(() => {
        // The message div sits right before the cleanup button in the admin section
        const msgDivs = document.querySelectorAll('.bg-navy-mid');
        for (const el of msgDivs) {
          const text = el.textContent?.trim();
          // Filter out non-message elements like the email span
          if (text && !text.startsWith('test@') && text.length > 0) {
            return text;
          }
        }
        return null;
      });
      if (result) return result;
      await new Promise(r => setTimeout(r, 500));
    }
    return null;
  }
}
