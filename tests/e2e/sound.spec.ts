import { expect, test } from '@playwright/test';
import { getEffective, getParams, makeTestWav, openStudio } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
test.describe('Sound Lab', () => {
  test('importa, reproduce y analiza un archivo de audio', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-sound').click();
    await page.getByTestId('audio-file-input').setInputFiles({ name: 'pulsos.wav', mimeType: 'audio/wav', buffer: makeTestWav() });
    await expect(page.getByTestId('track-item')).toHaveCount(1);
    await expect(page.getByTestId('track-item')).toContainText('pulsos');
    // Reproduce y avanza
    await expect.poll(() => page.evaluate(() => (window as any).__audio.state.playing)).toBe(true);
    const t0 = await page.evaluate(() => (window as any).__audio.currentTime);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => (window as any).__audio.currentTime)).toBeGreaterThan(t0);
    // El análisis detecta graves y pulsos, no agudos dominantes
    const peaks = await page.evaluate(async () => {
      const a = (window as any).__audio;
      let bass = 0;
      let beat = 0;
      let high = 0;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        bass = Math.max(bass, a.lastFrame.bass);
        beat = Math.max(beat, a.lastFrame.beat);
        high = Math.max(high, a.lastRaw.high);
      }
      return { bass, beat, high };
    });
    expect(peaks.bass).toBeGreaterThan(0.3);
    expect(peaks.beat).toBeGreaterThan(0.3);
    expect(peaks.bass).toBeGreaterThan(peaks.high);
    await expect(page.getByTestId('meter-bass')).not.toHaveAttribute('style', 'height: 0%;');
    // Pausa
    await page.getByTestId('audio-play').click();
    await expect.poll(() => page.evaluate(() => (window as any).__audio.state.playing)).toBe(false);
  });

  test('las vinculaciones modulan la escena en tiempo real y se pueden desactivar', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-sound').click();
    await page.getByTestId('audio-file-input').setInputFiles({ name: 'pulsos.wav', mimeType: 'audio/wav', buffer: makeTestWav() });
    await expect.poll(() => page.evaluate(() => (window as any).__audio.state.playing)).toBe(true);
    await page.getByTestId('add-binding').click();
    await page.getByTestId('binding-source').selectOption('bass');
    await page.getByTestId('binding-target').selectOption('scale');
    await page.getByTestId('binding-amount').fill('1');
    const base = (await getParams(page)).scale;
    const sample = () =>
      page.evaluate(async () => {
        let max = 0;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 50));
          max = Math.max(max, (window as any).__engine.currentParams.scale);
        }
        return max;
      });
    const modulated = await sample();
    expect(modulated).toBeGreaterThan(base + 0.3);
    // El valor guardado no cambia: solo el efectivo
    expect((await getParams(page)).scale).toBeCloseTo(base);
    // Desactivar globalmente
    await page.getByText('Vinculaciones activas').click();
    await expect(page.getByTestId('bindings-master')).not.toBeChecked();
    await expect.poll(async () => (await getEffective(page)).scale, { timeout: 10_000 }).toBeCloseTo(base);
  });

  test('pista de demostración sintetizada y generación musical con proveedor de prueba', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-sound').click();
    await page.getByTestId('add-demo-track').click();
    await expect(page.getByTestId('track-item').first()).toContainText('demostración', { timeout: 30_000 });
    await page.getByText('Generación musical (opcional)').click();
    await expect(page.getByTestId('music-generator')).toContainText('Proveedor de prueba (no es IA)');
    await page.getByTestId('music-generate').click();
    await expect(page.getByTestId('track-item')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId('track-list')).toContainText('[Prueba]');
  });

  test('rechaza archivos que no son audio con un mensaje claro', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-sound').click();
    await page.getByTestId('audio-file-input').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
    await expect(page.getByText('Formato no compatible')).toBeVisible();
    await page.getByTestId('audio-file-input').setInputFiles({ name: 'roto.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('esto no es un mp3 válido') });
    await expect(page.getByText('No se pudo decodificar el audio')).toBeVisible();
  });
});
