import { expect, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function openStudio(page: Page, path: string | null = '/?debug') {
  if (path) await page.goto(path);
  await page.waitForSelector('[data-testid=stage-canvas]');
  await page.waitForFunction(() => !!(window as any).__engine && !!(window as any).__store?.getState().project);
  // Deja que el motor produzca algunos fotogramas.
  await page.waitForFunction(() => (window as any).__engine.renderer.info.render.frame > 3, null, { timeout: 30_000 });
}

/** Estadísticas de píxeles del lienzo (media, desviación y huella) para comprobar que hay imagen y que cambia. */
export async function canvasStats(page: Page) {
  return page.evaluate(() => {
    const src = (window as any).__engine.canvas as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 40;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0, 64, 40);
    const d = ctx.getImageData(0, 0, 64, 40).data;
    let sum = 0;
    let sq = 0;
    const lum: number[] = [];
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      lum.push(l);
      sum += l;
      sq += l * l;
    }
    const n = lum.length;
    const mean = sum / n;
    return { mean, std: Math.sqrt(sq / n - mean * mean), lum, rgb: Array.from(d) };
  });
}

export function diff(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

export const getParams = (page: Page) => page.evaluate(() => (window as any).__store.getState().project.scene.params);
export const getEffective = (page: Page) => page.evaluate(() => (window as any).__engine.currentParams);
export const getProject = (page: Page) => page.evaluate(() => (window as any).__store.getState().project);

export async function setRange(page: Page, testId: string, value: number) {
  const loc = page.getByTestId(testId).first();
  await loc.fill(String(value));
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
}

/** WAV de prueba: pulsos graves a 120 BPM sobre un fondo agudo suave. */
export function makeTestWav(seconds = 6, sr = 44100): Buffer {
  const n = seconds * sr;
  const data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sr, 24);
  data.writeUInt32LE(sr * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const beatT = t % 0.5;
    const kick = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-beatT * 9) * 0.85;
    const hiss = Math.sin(2 * Math.PI * 4200 * t) * 0.05;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, kick + hiss)) * 32000), 44 + i * 2);
  }
  return data;
}
