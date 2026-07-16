import { chromium } from 'playwright';

const URL = 'http://localhost:5173';
const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

async function analyze() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: `/tmp/landing-${vp.name}.png`, fullPage: false });

    // Detailed element analysis
    const info = await page.evaluate(() => {
      // Helper to check if element is visually rendered
      function isVisible(el) {
        if (!el || el.offsetParent === null) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }

      const results = [];

      // Check main sections
      const sections = [
        { name: 'Navbar', el: document.querySelector('nav') },
        { name: 'Hero', el: document.querySelector('section:first-of-type') },
        { name: 'Capabilities', el: document.querySelector('#capabilities') },
        { name: 'Features', el: document.querySelectorAll('section')[2] },
        { name: 'Process', el: document.querySelector('#process') },
        { name: 'Quote', el: document.querySelector('.ethereal-gradient')?.closest('section') },
        { name: 'Pricing', el: document.querySelectorAll('section')[5] },
        { name: 'CTAMobile', el: document.querySelectorAll('section')[6] },
        { name: 'CTADesktop', el: document.querySelectorAll('section')[7] },
        { name: 'Footer', el: document.querySelector('footer') },
      ];

      for (const { name, el } of sections) {
        if (!el) { results.push({ name, exists: false }); continue; }
        const rect = el.getBoundingClientRect();
        results.push({
          name,
          exists: true,
          visible: isVisible(el),
          rect: { t: Math.round(rect.top), b: Math.round(rect.bottom), h: Math.round(rect.height) },
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 80),
        });
      }

      // Check responsive visibility of key elements
      const checks = [
        { name: 'mobile-hero-content', el: document.querySelector('.md\\:hidden') },
        { name: 'desktop-hero-content', el: document.querySelector('.hidden.md\\:flex') },
        { name: 'mobile-nav-links', el: document.querySelector('.md\\:hidden + .md\\:hidden') },
      ];

      for (const { name, el } of checks) {
        results.push({
          name,
          exists: !!el,
          visible: el ? isVisible(el) : false,
          text: el ? (el.textContent || '').trim().slice(0, 60) : '',
          rect: el ? el.getBoundingClientRect() : null,
        });
      }

      return results;
    });

    console.log(`\n===== ${vp.name} (${vp.width}x${vp.height}) =====`);
    for (const r of info) {
      if (!r.exists) {
        console.log(`  ✗ ${r.name}: NOT FOUND`);
      } else {
        const vis = r.visible ? 'VIS' : 'HID';
        const pos = r.rect ? ` @y=${r.rect.t} h=${r.rect.h}` : '';
        console.log(`  ${vis} ${r.name}${pos}`);
        if (r.text) console.log(`      "${r.text}"`);
      }
    }

    await context.close();
  }

  await browser.close();
}

analyze().catch(console.error);
