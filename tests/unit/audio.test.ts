import { describe, expect, it } from 'vitest';
import { BeatDetector, Envelope, applySensitivity, bandLevels, processFrame } from '../../src/audio/analysis';
import { modulate } from '../../src/audio/modulation';
import { worldPreset } from '../../shared/presets';
import { PARAM_DEFS } from '../../shared/params';

describe('análisis de audio', () => {
  it('asigna energía a la banda correcta', () => {
    const sr = 48000;
    const fft = 2048;
    const freq = new Uint8Array(fft / 2);
    const binHz = sr / fft;
    for (let i = Math.floor(40 / binHz); i <= Math.ceil(120 / binHz); i++) freq[i] = 255;
    const b = bandLevels(freq, sr, fft);
    expect(b.bass).toBeGreaterThan(0.6);
    expect(b.high).toBe(0);
  });

  it('detecta pulsos periódicos y estima el tempo', () => {
    const det = new BeatDetector();
    const dt = 1 / 60;
    let beats = 0;
    let prev = 0;
    for (let f = 0; f < 60 * 8; f++) {
      const t = f * dt;
      const phase = (t * 2) % 1; // 120 BPM
      const energy = phase < 0.08 ? 0.9 : 0.15;
      const p = det.step(energy, dt);
      if (p > 0.95 && prev <= 0.95) beats++;
      prev = p;
    }
    expect(beats).toBeGreaterThanOrEqual(12);
    expect(det.bpmEstimate).toBeGreaterThan(110);
    expect(det.bpmEstimate).toBeLessThan(130);
  });

  it('la sensibilidad escala la señal y respeta la puerta de ruido', () => {
    expect(applySensitivity(0.02, 3)).toBe(0);
    expect(applySensitivity(0.4, 2)).toBeGreaterThan(applySensitivity(0.4, 1));
    expect(applySensitivity(1, 3)).toBeLessThanOrEqual(1);
  });

  it('la envolvente sube rápido y baja lento según ataque/liberación', () => {
    const env = new Envelope();
    const hi = { bass: 1, lowMid: 1, mid: 1, high: 1, volume: 1, beat: 1 };
    const lo = { bass: 0, lowMid: 0, mid: 0, high: 0, volume: 0, beat: 0 };
    const up = env.step(hi, 1 / 60, 1, 0).bass;
    const down = env.step(lo, 1 / 60, 1, 0).bass;
    expect(up).toBeGreaterThan(0.5);
    expect(down).toBeGreaterThan(up * 0.8);
  });

  it('processFrame produce valores 0..1', () => {
    const f = processFrame({ bass: 0.8, lowMid: 0.5, mid: 0.3, high: 0.2, volume: 0.5 }, 0.5, { sensitivity: 1, attack: 1, release: 1 }, new Envelope(), 0.5);
    for (const v of Object.values(f)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('modulación', () => {
  const base = worldPreset('cosmos');
  const frame = { bass: 1, lowMid: 0, mid: 0, high: 0, volume: 0, beat: 0 };
  const binding = { id: 'b', source: 'bass' as const, target: 'scale' as const, amount: 0.5, enabled: true };

  it('suma la señal al valor base sin modificarlo', () => {
    const out = modulate(base, [binding], frame, { bindingsEnabled: true, intensity: 1 });
    const d = PARAM_DEFS.scale;
    expect(out.scale).toBeCloseTo(Math.min(d.max, base.scale + 0.5 * (d.max - d.min)));
    expect(base.scale).toBe(worldPreset('cosmos').scale);
  });

  it('respeta desactivación global e individual', () => {
    expect(modulate(base, [binding], frame, { bindingsEnabled: false, intensity: 1 })).toBe(base);
    expect(modulate(base, [{ ...binding, enabled: false }], frame, { bindingsEnabled: true, intensity: 1 })).toBe(base);
  });

  it('la intensidad global escala el efecto y se recorta al rango', () => {
    const a = modulate(base, [binding], frame, { bindingsEnabled: true, intensity: 0.2 }).scale;
    const b = modulate(base, [{ ...binding, amount: 1 }], frame, { bindingsEnabled: true, intensity: 2 }).scale;
    expect(a).toBeLessThan(b);
    expect(b).toBe(PARAM_DEFS.scale.max);
  });
});
