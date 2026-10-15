// Capturas de cada mundo (desarrollo): node scripts/world-shots.mjs <carpeta> [url] [mundos...]
import { chromium } from '@playwright/test';
const [out, url = 'http://localhost:5173/?debug', ...only] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || /THREE\.WebGLProgram|shader/i.test(m.text())) && errors.push(m.text().slice(0, 600)));
await page.goto(url);
await page.waitForFunction(() => window.__engine && window.__store?.getState().project);
const worlds = only.length ? only : await page.evaluate(() => Object.keys(window.__engine.constructor ? {} : {}));
for (const w of worlds) {
  await page.evaluate((w) => window.__store.getState().setWorld(w), w);
  await page.waitForTimeout(4500);
  await page.locator('.stage').screenshot({ path: `${out}/w-${w}.png` });
  const fps = await page.evaluate(() => window.__engine && document.querySelector('[data-testid=hud-stats]')?.textContent);
  console.log(w, fps);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
