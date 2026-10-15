import { expect, test } from '@playwright/test';
import { openStudio } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
test.describe('Responsive', () => {
  test('móvil: escenario visible, navegación inferior y sin desbordamiento horizontal', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openStudio(page);
    const stage = await page.locator('.stage').boundingBox();
    expect(stage!.width).toBeGreaterThan(360);
    expect(stage!.height).toBeGreaterThan(250);
    const rail = await page.locator('.rail').boundingBox();
    expect(rail!.y + rail!.height).toBeGreaterThan(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    for (const m of ['sound', 'story', 'export', 'library', 'studio']) {
      await page.getByTestId(`mode-${m}`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), m).toBe(true);
    }
    await page.screenshot({ path: 'test-results/mobile.png', fullPage: false });
    await ctx.close();
  });

  test('tableta horizontal', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await openStudio(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await ctx.close();
  });
});

test.describe('Estados de error', () => {
  test('sin servidor de integraciones la app funciona en modo local y lo explica', async ({ page }) => {
    await page.route('**/api/**', (r) => r.abort());
    await openStudio(page);
    await expect(page.getByTestId('interp-ai')).toBeDisabled();
    await page.getByTestId('prompt-input').fill('más rápido');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('prompt-changes')).toContainText('Velocidad');
    await page.getByTestId('mode-sound').click();
    await page.getByText('Generación musical (opcional)').click();
    await expect(page.getByText('El servidor de integraciones no está en ejecución')).toBeVisible();
  });

  test('sin WebGL se muestra un mensaje comprensible en lugar de una pantalla rota', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith('webgl')) return null;
        return (orig as any).call(this, type, ...rest);
      } as any;
    });
    await page.goto('/');
    await expect(page.getByText('El escenario no puede renderizarse')).toBeVisible();
    await expect(page.getByText(/WebGL/)).toBeVisible();
    // El resto de la interfaz sigue operativa
    await page.getByTestId('mode-library').click();
    await expect(page.getByTestId('panel-library')).toBeVisible();
  });

  test('el cliente no contiene claves ni expone credenciales en /api/capabilities', async ({ page, request }) => {
    const caps = await request.get('http://localhost:8787/api/capabilities');
    const text = await caps.text();
    expect(text).not.toMatch(/sk-|api[_-]?key|secret|token/i);
    await openStudio(page);
    const scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.src).filter(Boolean));
    for (const src of scripts) {
      const body = await (await request.get(src)).text();
      expect(body).not.toMatch(/sk-ant-|ANTHROPIC_API_KEY|OPENAI_COMPAT_API_KEY|MUSIC_API_KEY/);
    }
  });
});
