// Capturas de referencia de la interfaz (uso: node scripts/shots.mjs <carpeta>)
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? 'test-results';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await m.goto('http://localhost:4173/?debug');
await m.waitForFunction(() => window.__engine);
await m.getByTestId('mode-library').click();
await m.waitForTimeout(500);
await m.getByTestId('mode-studio').click();
await m.waitForTimeout(1500);
console.log('current:', await m.evaluate(() => [...document.querySelectorAll('.rail-btn')].map((b) => `${b.textContent}:${b.getAttribute('aria-current')}`).join(' ')));
await m.screenshot({ path: `${out}/m-studio.png` });
const d = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await d.goto('http://localhost:4173/?debug');
await d.waitForFunction(() => window.__engine);
for (const mode of ['sound', 'story', 'export', 'library']) {
  await d.getByTestId(`mode-${mode}`).click();
  if (mode === 'story') await d.getByTestId('template-sea-to-stars').click();
  await d.waitForTimeout(2500);
  await d.screenshot({ path: `${out}/d-${mode}.png` });
}
await browser.close();
