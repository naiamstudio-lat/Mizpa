import { chromium } from 'playwright';

const URL = 'http://localhost:5173';

async function capture() {
  const browser = await chromium.launch({ headless: true });

  const sizes = [
    { name: 'mobile-390', w: 390, h: 844 },
    { name: 'desktop-1440', w: 1440, h: 900 },
  ];

  for (const s of sizes) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/landing-${s.name}.png`, fullPage: true });

    // Log key info
    const info = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const h1style = h1 ? window.getComputedStyle(h1) : null;
      const btn = document.querySelector('nav button:last-child, section button');
      const btnStyle = btn ? window.getComputedStyle(btn) : null;
      return {
        h1: h1style ? `${h1style.fontSize} ${h1style.fontWeight} ${h1style.fontFamily}` : 'N/A',
        btn: btnStyle ? `bg:${btnStyle.backgroundColor} color:${btnStyle.color} font:${btnStyle.fontSize} family:${btnStyle.fontFamily}` : 'N/A',
        hasJetBrains: document.fonts.check('12px "JetBrains Mono"'),
        hasMaterial: document.fonts.check('24px "Material Symbols Outlined"'),
      };
    });

    console.log(`${s.name}:`, JSON.stringify(info, null, 2));
    await ctx.close();
  }

  await browser.close();
  console.log('Screenshots saved to /tmp/landing-*.png');
}

capture().catch(console.error);
