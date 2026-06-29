import puppeteer from 'puppeteer';

async function main() {
  const launchOptions = {
    headless: true,
    executablePath: '/workspaces/Mizpa/chrome/linux-151.0.7920.0/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  };

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Log ALL console messages including errors
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' || text.toLowerCase().includes('error') || text.toLowerCase().includes('cleanup') || text.includes('supabase') || text.includes('auth')) {
      console.log(`[${msg.type()}]`, text);
    }
  });
  page.on('pageerror', err => console.log('PAGE_UNHANDLED:', err.message));

  // Login
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
  console.log("At login page");
  
  await page.type('input[type=email]', 'test@mizpa.dev');
  await page.type('input[type=password]', 'Test123456');
  await page.click('button[type=submit]');
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 10000 });
  console.log("On dashboard");

  // Check localStorage for session
  const hasSession = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    const supabaseKeys = keys.filter(k => k.includes('supabase') || k.includes('sb-'));
    return { keys: keys.length, supabaseKeys };
  });
  console.log('localStorage:', JSON.stringify(hasSession));

  // Wait for a moment then try clicking
  await new Promise(r => setTimeout(r, 1000));

  // Click the cleanup button
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent?.includes('Limpiar VMs inactivas'));
    if (btn) {
      (btn as HTMLButtonElement).scrollIntoView({ behavior: 'instant', block: 'center' });
      setTimeout(() => btn.click(), 100);
      return 'found_and_clicked';
    }
    return 'not_found';
  });
  console.log('Click result:', clicked);

  // Wait and monitor
  await new Promise(r => setTimeout(r, 3000));

  // Check what's visible now
  const state = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const cleanupBtn = btns.find(b => b.textContent?.includes('Limpiar'));
    const msgDivs = Array.from(document.querySelectorAll('.bg-navy-mid'));
    return {
      buttonText: cleanupBtn?.textContent || null,
      buttonDisabled: cleanupBtn ? (cleanupBtn as HTMLButtonElement).disabled : null,
      messages: msgDivs.map(d => d.textContent?.trim()).filter(Boolean),
      adminHeader: document.querySelector('h2')?.textContent,
    };
  });
  console.log('UI state:', JSON.stringify(state, null, 2));

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
