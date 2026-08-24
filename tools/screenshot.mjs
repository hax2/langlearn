import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE || 'http://localhost:4174/langlearn';
const OUT = process.env.SHOT_DIR || '/tmp/opencode/shots';

const routes = [
  ['home', '/'],
  ['learn', '/learn'],
  ['read', '/read/'],
  ['practice', '/practice/'],
];

const browser = await puppeteer.launch({
  executablePath:
    '/home/Shodan/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox', '--disable-gpu'],
});

// seed a little fake progress so the dashboard shows real-looking rows
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
await page.evaluate(() => {
  localStorage.setItem(
    'puente_v1',
    JSON.stringify({ xp: 340, streak: 4, bestStreak: 6, srs: { s1: { box: 1, due: Date.now() - 1000 }, s2: { box: 2, due: Date.now() + 8e7 } }, stats: {}, settings: {}, seenHelp: true })
  );
  localStorage.setItem('spanish-reader-progress', JSON.stringify({ 'samaniego-leon-raton': { time: 40, duration: 100, updatedAt: new Date().toISOString() } }));
  localStorage.setItem(
    'gemlang-progress',
    JSON.stringify({
      modules: {
        'module-1': { completedAt: new Date().toISOString(), totalSentences: 48, currentIndex: 48 },
        'module-2': { currentIndex: 20, totalSentences: 40 },
      },
    })
  );
});
await page.reload({ waitUntil: 'networkidle2' });

for (const [name, path] of routes) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  if (name === 'read') {
    // dismiss first-run onboarding so the library itself is visible
    await p.evaluate(() => {
      const dlg = document.querySelector('#onboardingDialog');
      if (dlg && dlg.open) document.querySelector('#onboardingSkipBtn')?.click();
    });
    await new Promise((r) => setTimeout(r, 600));
  }
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
  await p.close();
}

await browser.close();
