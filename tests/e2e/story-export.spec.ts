import { expect, test } from '@playwright/test';
import { getProject, makeTestWav, openStudio } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
test.describe('Story Worlds', () => {
  test('plantilla, edición de escenas, reproducción y vuelta al estudio', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-story').click();
    await page.getByTestId('template-sea-to-stars').click();
    await expect(page.getByTestId('scene-item')).toHaveCount(4);
    // Duplicar, reordenar y eliminar
    await page.getByTestId('scene-duplicate').first().click();
    await expect(page.getByTestId('scene-item')).toHaveCount(5);
    const firstName = (await getProject(page)).sequence.scenes[0].name;
    await page.getByTestId('scene-down').first().click();
    expect((await getProject(page)).sequence.scenes[1].name).toBe(firstName);
    await page.getByTestId('scene-delete').nth(1).click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByTestId('scene-item')).toHaveCount(4);
    // Editar una escena
    await page.getByTestId('scene-item').first().click();
    await page.getByTestId('scene-name').fill('Apertura');
    await page.getByTestId('scene-duration').fill('3');
    const s0 = (await getProject(page)).sequence.scenes[0];
    expect(s0.name).toBe('Apertura');
    expect(s0.duration).toBe(3);
    // Reproducir: el tiempo avanza y el escenario cambia de escena
    await page.getByTestId('story-play').click();
    await expect(page.getByTestId('hud-world')).toContainText('Secuencia');
    await expect.poll(() => page.evaluate(() => (window as any).__store.getState() && document.querySelector('[data-testid=story-time]')?.textContent), { timeout: 20_000 }).toMatch(/^0:0[3-9]/);
    await page.getByTestId('story-stop').click();
    await expect(page.getByTestId('hud-world')).toContainText('Mundo');
  });

  test('generador local desde una idea con varias escenas y mundos', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-story').click();
    await page.getByTestId('story-idea').fill('Una noche serena en el mar. Luego viajamos al espacio entre estrellas misteriosas. Finalmente amanece sobre las montañas.');
    await page.getByTestId('story-generate').click();
    await expect(page.getByTestId('scene-item')).toHaveCount(3);
    const worlds = (await getProject(page)).sequence.scenes.map((s: any) => s.world);
    expect(worlds).toEqual(['ocean', 'cosmos', 'atmosphere']);
    // Consistencia: la paleta de la escena 1 se copia al resto
    await page.getByText('Consistencia entre escenas').click();
    await page.getByTestId('consistency-toggle').check({ force: true });
    const scenes = (await getProject(page)).sequence.scenes;
    expect(scenes[2].params.primaryColor).toBe(scenes[0].params.primaryColor);
  });
});

test.describe('Export Studio', () => {
  test('captura a 2× con resolución real', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-export').click();
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-image').click();
    const file = await dl;
    await expect(page.getByTestId('image-result')).toBeVisible();
    const fs = await import('node:fs');
    const buf = fs.readFileSync((await file.path())!);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const stage = await page.evaluate(() => ({ w: (window as any).__engine.canvas.clientWidth, h: (window as any).__engine.canvas.clientHeight }));
    expect(w).toBe(Math.floor(stage.w * 2));
    expect(h).toBe(Math.floor(stage.h * 2));
  });

  test('graba la experiencia con audio y entrega el archivo', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-sound').click();
    await page.getByTestId('audio-file-input').setInputFiles({ name: 'pulsos.wav', mimeType: 'audio/wav', buffer: makeTestWav() });
    await expect.poll(() => page.evaluate(() => (window as any).__audio.state.playing)).toBe(true);
    await page.getByTestId('mode-export').click();
    await page.getByTestId('video-duration').fill('2');
    await page.getByTestId('video-resolution').selectOption('viewport');
    const dl = page.waitForEvent('download', { timeout: 40_000 });
    await page.getByTestId('video-record').click();
    await expect(page.getByTestId('video-progress')).toBeVisible();
    await expect(page.getByTestId('rec-badge')).toBeVisible();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
    const fs = await import('node:fs');
    const size = fs.statSync((await file.path())!).size;
    expect(size).toBeGreaterThan(10_000);
    await expect(page.getByTestId('video-result')).toContainText('con pista de audio');
    await expect(page.getByTestId('rec-badge')).toHaveCount(0);
  });

  test('distingue captura, grabación y vídeo IA (no disponible, sin botón que prometa)', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-export').click();
    const panel = page.getByTestId('panel-export');
    await expect(panel.getByRole('heading', { name: 'Captura de imagen' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Grabación de la experiencia' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Vídeo generado por IA' })).toBeVisible();
    await expect(panel.getByText('No disponible')).toBeVisible();
    await expect(panel.getByRole('button', { name: /generar vídeo/i })).toHaveCount(0);
  });
});
