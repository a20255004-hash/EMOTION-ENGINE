import { expect, test } from '@playwright/test';
import { canvasStats, diff, getEffective, getParams, openStudio, setRange } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
test.describe('Experience Studio', () => {
  test('las tres experiencias se renderizan con imagen distinta', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await openStudio(page);
    const shots: Record<string, number[]> = {};
    for (const w of ['ocean', 'cosmos', 'atmosphere'] as const) {
      await page.getByTestId(`world-${w}`).click();
      await expect(page.getByTestId('hud-world')).toContainText(w === 'ocean' ? 'Océano' : w === 'cosmos' ? 'Universo' : 'Paisaje');
      await page.waitForTimeout(1500);
      const s = await canvasStats(page);
      expect(s.std, `${w} no debe ser una imagen plana`).toBeGreaterThan(4);
      shots[w] = s.rgb;
      expect(await page.evaluate(() => (window as any).__engine.worldId)).toBe(w);
    }
    expect(diff(shots.ocean, shots.cosmos)).toBeGreaterThan(10);
    expect(diff(shots.cosmos, shots.atmosphere)).toBeGreaterThan(10);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('los controles cambian los parámetros del motor y la imagen en tiempo real', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('btn-pause').click();
    await page.waitForTimeout(500);
    const before = await canvasStats(page);
    await setRange(page, 'param-speed', 2.4);
    await page.locator('summary', { hasText: 'Intensidad visual' }).click();
    await page.getByTestId('param-exposure').fill('2.6');
    await page.getByTestId('param-accentColor').first().fill('#ff2200');
    await page.waitForTimeout(800);
    const p = await getParams(page);
    expect(p.speed).toBeCloseTo(2.4);
    expect(p.exposure).toBeCloseTo(2.6);
    expect(p.accentColor).toBe('#ff2200');
    const eff = await getEffective(page);
    expect(eff.exposure).toBeCloseTo(2.6);
    const after = await canvasStats(page);
    expect(after.mean).toBeGreaterThan(before.mean + 5);
    // Deshacer devuelve el valor anterior
    await page.getByTestId('undo').click();
    expect((await getParams(page)).accentColor).not.toBe('#ff2200');
  });

  test('pausa, reanudación y reinicio controlan el tiempo de animación', async ({ page }) => {
    await openStudio(page);
    const t = () => page.evaluate(() => (window as any).__engine.animTime as number);
    await page.getByTestId('btn-pause').click();
    const t1 = await t();
    await page.waitForTimeout(800);
    expect(await t()).toBeCloseTo(t1, 5);
    await page.getByTestId('btn-pause').click();
    await expect.poll(t, { timeout: 10_000 }).toBeGreaterThan(t1);
    await page.getByTestId('btn-reset').click();
    expect(await t()).toBeLessThan(0.5);
  });

  test('modo de cámara y pantalla completa', async ({ page }) => {
    await openStudio(page);
    const before = (await getParams(page)).cameraMode;
    await page.getByTestId('btn-camera-mode').click();
    expect((await getParams(page)).cameraMode).not.toBe(before);
    await page.getByTestId('btn-fullscreen').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('captura rápida descarga un PNG real', async ({ page }) => {
    await openStudio(page);
    const dl = page.waitForEvent('download');
    await page.getByTestId('btn-capture').click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/\.png$/);
    const path = await file.path();
    const fs = await import('node:fs');
    const buf = fs.readFileSync(path!);
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.length).toBeGreaterThan(5000);
  });
});

test.describe('Editor por lenguaje natural', () => {
  test('las instrucciones de ejemplo producen cambios válidos', async ({ page }) => {
    await openStudio(page);
    const input = page.getByTestId('prompt-input');
    const speed0 = (await getParams(page)).speed;
    await input.fill('haz el movimiento más lento');
    await input.press('Enter');
    await expect(page.getByTestId('prompt-changes')).toContainText('Velocidad');
    expect((await getParams(page)).speed).toBeLessThan(speed0);

    await input.fill('añade partículas doradas');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('prompt-changes')).toContainText('Color de partículas');
    expect((await getParams(page)).particleColor).toBe('#ffc24a');

    await input.fill('crea una atmósfera más misteriosa');
    await input.press('Enter');
    await expect(page.getByTestId('prompt-result')).toContainText('misteriosa');

    await input.fill('haz que las formas reaccionen a los graves');
    await input.press('Enter');
    const proj = await page.evaluate(() => (window as any).__store.getState().project);
    expect(proj.audio.bindings.some((b: any) => b.source === 'bass' && b.target === 'scale')).toBe(true);
  });

  test('explica lo que no entiende y el modo IA indica que no está configurado', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('prompt-input').fill('escribe un poema sobre mi gato');
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId('prompt-unmatched')).toBeVisible();
    await expect(page.getByTestId('interp-ai')).toBeDisabled();
    await expect(page.getByTestId('interp-ai')).toContainText('no configurada');
    await expect(page.getByTestId('cap-ai')).toContainText('local');
  });

  test('deshacer revierte la instrucción aplicada', async ({ page }) => {
    await openStudio(page);
    const v0 = (await getParams(page)).fogDensity;
    await page.getByTestId('prompt-input').fill('mucha más niebla');
    await page.getByTestId('prompt-input').press('Enter');
    expect((await getParams(page)).fogDensity).toBeGreaterThan(v0);
    await page.getByTestId('prompt-undo').click();
    expect((await getParams(page)).fogDensity).toBeCloseTo(v0);
  });
});
