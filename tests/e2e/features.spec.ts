import { expect, test } from '@playwright/test';
import { getParams, getProject, openStudio } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const say = async (page: any, text: string) => {
  await page.getByTestId('prompt-input').fill(text);
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('prompt-result')).toContainText(text.slice(0, 8));
};

test.describe('Sonido ambiente', () => {
  test('cada escenario suena y la señal llega al analizador', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('btn-ambience').click();
    await expect(page.getByTestId('btn-ambience')).toHaveAttribute('aria-pressed', 'true');
    for (const w of ['ocean', 'neon', 'abyss']) {
      await page.getByTestId(`world-${w}`).click();
      const level = await page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 2200));
        let m = 0;
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 60));
          const r = (window as any).__audio.lastRaw;
          m = Math.max(m, r.bass + r.lowMid + r.mid + r.high);
        }
        return m;
      });
      expect(level, `sonido de ${w}`).toBeGreaterThan(0.05);
    }
    expect((await getProject(page)).audio.settings.ambienceEnabled).toBe(true);
    await page.getByTestId('btn-ambience').click();
    await expect(page.getByTestId('btn-ambience')).toHaveAttribute('aria-pressed', 'false');
    expect((await getProject(page)).audio.settings.ambienceEnabled).toBe(false);
  });
});

test.describe('Órdenes y atajos', () => {
  test('el editor entiende escenarios, paletas y órdenes de la app', async ({ page }) => {
    await openStudio(page);
    await say(page, 'llévame al bosque');
    expect((await getProject(page)).scene.world).toBe('forest');
    await say(page, 'paleta vaporwave');
    expect((await getParams(page)).primaryColor).toBe('#ff71ce');
    await say(page, 'pausa');
    await expect.poll(() => page.evaluate(() => (window as any).__engine.isPaused)).toBe(true);
    await say(page, 'reanuda');
    await expect.poll(() => page.evaluate(() => (window as any).__engine.isPaused)).toBe(false);
    await page.getByTestId('prompt-input').fill('abre sound lab');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('panel-sound')).toBeVisible();
  });

  test('sorpréndeme cambia la escena y se puede deshacer', async ({ page }) => {
    await openStudio(page);
    const before = await getProject(page);
    await page.getByTestId('btn-surprise').click();
    await expect.poll(async () => (await getProject(page)).scene.world).not.toBe(before.scene.world);
    await page.getByTestId('undo').click();
    expect((await getProject(page)).scene.world).toBe(before.scene.world);
  });

  test('teclas 1–0 cambian de escenario y H abre la ayuda', async ({ page }) => {
    await openStudio(page);
    await page.locator('.stage').click({ position: { x: 20, y: 200 } });
    await page.keyboard.press('6');
    await expect.poll(async () => (await getProject(page)).scene.world).toBe('neon');
    await page.keyboard.press('0');
    await expect.poll(async () => (await getProject(page)).scene.world).toBe('vortex');
    await page.keyboard.press('h');
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-dialog')).toHaveCount(0);
  });

  test('plantilla «Gira por los 10 mundos»', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-story').click();
    await page.getByTestId('template-world-tour').click();
    await expect(page.getByTestId('scene-item')).toHaveCount(10);
    const worlds = new Set((await getProject(page)).sequence.scenes.map((s: any) => s.world));
    expect(worlds.size).toBe(10);
  });
});

test.describe('Bienvenida', () => {
  test('aparece la primera vez y no vuelve a aparecer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByRole('button', { name: 'Entrar sin sonido' }).click();
    await expect(page.getByTestId('welcome')).toHaveCount(0);
    await page.reload();
    await page.waitForSelector('[data-testid=stage-canvas]');
    await page.waitForTimeout(800);
    await expect(page.getByTestId('welcome')).toHaveCount(0);
  });
});
