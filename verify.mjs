import { chromium } from 'playwright';

const URL = 'http://localhost:5173';

async function verify() {
  const browser = await chromium.launch({ headless: true });

  // Check desktop (1440px)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    // Get ALL h1s
    const allH1s = document.querySelectorAll('h1');
    const h1Data = [];
    allH1s.forEach((h1, i) => {
      const style = window.getComputedStyle(h1);
      const parent = h1.closest('[class*="hidden"]') || h1.parentElement;
      const parentDisplay = window.getComputedStyle(parent).display;
      h1Data.push({
        index: i,
        visible: parentDisplay !== 'none',
        parentDisplay,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontFamily: style.fontFamily,
        color: style.color,
        text: h1.textContent.trim().slice(0, 80),
      });
    });

    // Get all visible buttons
    const buttons = document.querySelectorAll('button');
    const btnData = [];
    buttons.forEach((btn, i) => {
      const style = window.getComputedStyle(btn);
      if (style.display !== 'none') {
        btnData.push({
          index: i,
          bg: style.backgroundColor,
          color: style.color,
          text: btn.textContent.trim().slice(0, 40),
          fontSize: style.fontSize,
          borderRadius: style.borderRadius,
        });
      }
    });

    return { h1Data, btnData };
  });

  console.log('=== DESKTOP H1s ===');
  info.h1Data.forEach(h => {
    console.log(`  H1 #${h.index}: ${h.visible ? 'VISIBLE' : 'hidden'} parent=${h.parentDisplay} ${h.fontSize}/${h.fontWeight} "${h.text}"`);
  });

  console.log('\n=== VISIBLE BUTTONS ===');
  info.btnData.forEach(b => {
    console.log(`  #${b.index}: bg=${b.bg} color=${b.color} font=${b.fontSize} "${b.text}"`);
  });

  // Take viewport-only screenshot
  await page.screenshot({ path: '/tmp/landing-desktop-viewport.png' });

  await ctx.close();
  await browser.close();
}

verify().catch(console.error);
