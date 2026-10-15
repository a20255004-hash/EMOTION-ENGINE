import { expect, test } from '@playwright/test';
import { getParams, getProject, openStudio, setRange, waitSaved } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
test.describe('Proyectos y persistencia', () => {
  test('los cambios se guardan y se recuperan tras recargar', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('project-name').fill('Mareas de prueba');
    await page.getByTestId('project-name').press('Enter');
    await page.getByTestId('world-cosmos').click();
    await setRange(page, 'param-turbulence', 1.7);
    await waitSaved(page);
    await page.reload();
    await openStudio(page);
    await expect(page.getByTestId('project-name')).toHaveValue('Mareas de prueba');
    const p = await getProject(page);
    expect(p.scene.world).toBe('cosmos');
    expect(p.scene.params.turbulence).toBeCloseTo(1.7);
  });

  test('una recarga inmediata no pierde el último cambio (copia de recuperación)', async ({ page }) => {
    await openStudio(page);
    await setRange(page, 'param-speed', 2.9);
    // Recarga antes de que salte el autoguardado.
    await page.reload();
    await openStudio(page, null);
    expect((await getParams(page)).speed).toBeCloseTo(2.9);
  });

  test('crear, duplicar, abrir y eliminar con confirmación', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('mode-library').click();
    const cards = page.getByTestId('project-card');
    await expect(cards.first()).toBeVisible();
    const n0 = await cards.count();
    await page.getByTestId('new-project-name').fill('Proyecto B');
    await page.getByTestId('create-project').click();
    await expect(cards).toHaveCount(n0 + 1);
    await expect(page.getByTestId('project-name')).toHaveValue('Proyecto B');
    await page.getByTestId('project-duplicate').first().click();
    await expect(cards).toHaveCount(n0 + 2);
    await expect(page.getByText('Proyecto B (copia)')).toBeVisible();
    // Cancelar no elimina
    await page.getByTestId('project-delete').first().click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(cards).toHaveCount(n0 + 2);
    // Confirmar elimina
    await page.getByTestId('project-delete').first().click();
    await page.getByTestId('confirm-action').click();
    await expect(cards).toHaveCount(n0 + 1);
  });

  test('versiones: guardar y restaurar', async ({ page }) => {
    await openStudio(page);
    await setRange(page, 'param-speed', 0.3);
    await page.getByTestId('mode-library').click();
    await page.getByTestId('save-version').click();
    await expect(page.getByTestId('version-item').first()).toBeVisible();
    await page.getByTestId('mode-studio').click();
    await setRange(page, 'param-speed', 2.8);
    await page.getByTestId('mode-library').click();
    await page.getByTestId('version-item').filter({ hasText: 'Versión 1' }).getByTestId('version-restore').click();
    await page.getByTestId('confirm-action').click();
    await expect.poll(async () => (await getParams(page)).speed).toBeCloseTo(0.3);
  });

  test('exportar e importar el proyecto como JSON', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('project-name').fill('Viaje exportable');
    await page.getByTestId('project-name').press('Enter');
    await page.getByTestId('mode-export').click();
    await page.getByText('Proyecto y experiencia compartible').click();
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-json').click();
    const file = await dl;
    const fs = await import('node:fs');
    const json = JSON.parse(fs.readFileSync((await file.path())!, 'utf8'));
    expect(json.format).toBe('emotion-engine/project');
    expect(json.project.name).toBe('Viaje exportable');
    await page.getByTestId('mode-library').click();
    await page.getByTestId('import-project-input').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    await expect.poll(async () => (await getProject(page)).id).not.toBe(json.project.id);
    expect((await getProject(page)).name).toBe('Viaje exportable');
    // JSON inválido → error comprensible
    await page.getByTestId('import-project-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
    await expect(page.getByText('no es JSON válido')).toBeVisible();
  });
});
