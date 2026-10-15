import { chromium } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/?debug');
await page.waitForSelector('[data-testid=stage-canvas]', { timeout: 20000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/ocean.png` });
for (const w of ['cosmos', 'atmosphere']) {
  await page.click(`[data-testid=world-${w}]`);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/${w}.png` });
}
const stats = await page.textContent('[data-testid=hud-stats]').catch(() => null);
console.log('stats', stats);
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
