import { chromium } from 'playwright';

const URL = 'http://localhost:5173';

async function check() {
  const browser = await chromium.launch({ headless: true });

  // --- Check BOTH mobile (390) and desktop (1440) ---
  const sizes = [
    { name: 'mobile', w: 390, h: 844 },
    { name: 'desktop', w: 1440, h: 900 },
  ];

  for (const s of sizes) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check specific elements computed styles
    const styles = await page.evaluate(() => {
      // Hero responsive divs
      const mobileDivs = document.querySelectorAll('.md\\:hidden');
      const desktopDivs = document.querySelectorAll('.hidden.md\\:flex');
      
      const results = {};

      // Check mobile vs desktop hero content
      const heroSection = document.querySelector('section:first-of-type');
      if (heroSection) {
        const children = heroSection.querySelectorAll(':scope > div');
        children.forEach((div, i) => {
          const style = window.getComputedStyle(div);
          const text = div.textContent.trim().slice(0, 60);
          results[`hero-child-${i}`] = {
            display: style.display,
            text,
            visible: div.offsetParent !== null,
          };
        });
      }

      // Check font loading
      const fonts = [...document.fonts].map(f => ({
        family: f.family,
        status: f.status,
      }));

      // Check actual rendered font on h1
      const h1 = document.querySelector('h1');
      const h1Style = h1 ? window.getComputedStyle(h1) : null;

      // Check button
      const primaryBtn = document.querySelector('button:not(.hidden)');
      const btnStyle = primaryBtn ? window.getComputedStyle(primaryBtn) : null;

      return { results, fonts, h1: h1Style?.fontFamily, h1Weight: h1Style?.fontWeight, h1Size: h1Style?.fontSize, h1Color: h1Style?.color, btnFont: btnStyle?.fontFamily, btnBg: btnStyle?.backgroundColor, btnColor: btnStyle?.color };
    });

    console.log(`\n===== ${s.name} (${s.w}x${s.h}) =====`);
    console.log('Fonts:', styles.fonts.map(f => `${f.family}(${f.status})`).join(', '));
    console.log('H1:', styles.h1, styles.h1Weight, styles.h1Size, styles.h1Color);
    console.log('Btn:', styles.btnFont, styles.btnBg, styles.btnColor);
    console.log('Hero children:');
    for (const [k, v] of Object.entries(styles.results)) {
      console.log(`  ${k}: display=${v.display} visible=${v.visible} "${v.text}"`);
    }

    // Take screenshot
    await page.screenshot({ path: `/tmp/landing-${s.name}-viewport.png` });

    await ctx.close();
  }

  await browser.close();
}

check().catch(console.error);
