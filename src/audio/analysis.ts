/**
 * Análisis de audio puro (sin dependencias del navegador) para poder probarlo.
 * Convierte el espectro de un AnalyserNode en señales 0..1 por banda, detecta
 * pulsos rítmicos y aplica sensibilidad y envolvente de respuesta.
 */
import type { AudioSettings } from '../../shared/schema';
import type { AudioFrame } from '../engine/types';

export const BAND_RANGES = {
  bass: [20, 150],
  lowMid: [150, 500],
  mid: [500, 2000],
  high: [2000, 12000],
} as const;

export type RawBands = Omit<AudioFrame, 'beat'>;

export function bandLevels(freq: ArrayLike<number>, sampleRate: number, fftSize: number): RawBands {
  const binHz = sampleRate / fftSize;
  const avg = (lo: number, hi: number) => {
    const a = Math.max(0, Math.floor(lo / binHz));
    const b = Math.min(freq.length - 1, Math.ceil(hi / binHz));
    if (b < a) return 0;
    let sum = 0;
    for (let i = a; i <= b; i++) sum += freq[i];
    return sum / ((b - a + 1) * 255);
  };
  const bass = avg(...BAND_RANGES.bass);
  const lowMid = avg(...BAND_RANGES.lowMid);
  const mid = avg(...BAND_RANGES.mid);
  const high = avg(...BAND_RANGES.high);
  // Volumen percibido aproximado: ponderación hacia graves y medios.
  const volume = Math.min(1, bass * 0.35 + lowMid * 0.3 + mid * 0.25 + high * 0.1);
  return { bass, lowMid, mid, high, volume };
}

/** Detector de pulsos por energía de graves con umbral adaptativo. */
export class BeatDetector {
  private history: number[] = [];
  private cooldown = 0;
  private pulse = 0;
  bpmEstimate = 0;
  private lastBeatAt = -1;
  private elapsed = 0;
  private intervals: number[] = [];

  constructor(private size = 43) {}

  step(energy: number, dt: number, sensitivity = 1): number {
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.pulse *= Math.exp(-dt * 7);
    const h = this.history;
    const mean = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
    const variance = h.length ? h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length : 0;
    // Umbral adaptativo: por encima de la media reciente en proporción a su variabilidad.
    const threshold = mean + Math.max(0.04, Math.sqrt(variance) * 1.1) / Math.max(0.3, sensitivity);
    const rising = energy > (h[h.length - 1] ?? 0);
    if (h.length >= 8 && rising && energy > threshold && energy > 0.1 && this.cooldown === 0) {
      this.pulse = 1;
      this.cooldown = 0.22;
      if (this.lastBeatAt >= 0) {
        const iv = this.elapsed - this.lastBeatAt;
        if (iv > 0.25 && iv < 1.5) {
          this.intervals.push(iv);
          if (this.intervals.length > 12) this.intervals.shift();
          const sorted = [...this.intervals].sort((a, b) => a - b);
          this.bpmEstimate = Math.round(60 / sorted[Math.floor(sorted.length / 2)]);
        }
      }
      this.lastBeatAt = this.elapsed;
    }
    h.push(energy);
    if (h.length > this.size) h.shift();
    return this.pulse;
  }

  reset() {
    this.history = [];
    this.pulse = 0;
    this.cooldown = 0;
    this.intervals = [];
    this.lastBeatAt = -1;
    this.bpmEstimate = 0;
  }
}

/** Envolvente con ataque/liberación independientes por señal. */
export class Envelope {
  private values: Record<keyof AudioFrame, number> = { bass: 0, lowMid: 0, mid: 0, high: 0, volume: 0, beat: 0 };

  step(target: AudioFrame, dt: number, attack: number, release: number): AudioFrame {
    const ka = 1 - Math.exp(-dt * (3 + attack * 45));
    const kr = 1 - Math.exp(-dt * (1 + release * 18));
    const out = {} as AudioFrame;
    for (const key of Object.keys(this.values) as (keyof AudioFrame)[]) {
      const cur = this.values[key];
      const t = target[key];
      const k = t > cur ? ka : kr;
      this.values[key] = cur + (t - cur) * k;
      out[key] = this.values[key];
    }
    return out;
  }

  reset() {
    for (const k of Object.keys(this.values) as (keyof AudioFrame)[]) this.values[k] = 0;
  }
}

/** Aplica sensibilidad con una pequeña puerta de ruido y saturación suave. */
export function applySensitivity(v: number, sensitivity: number): number {
  const gated = Math.max(0, v - 0.04);
  const x = gated * sensitivity * 1.6;
  return Math.min(1, x / (1 + x * 0.35));
}

export function processFrame(raw: RawBands, beat: number, settings: Pick<AudioSettings, 'sensitivity' | 'attack' | 'release'>, env: Envelope, dt: number): AudioFrame {
  const s = settings.sensitivity;
  const target: AudioFrame = {
    bass: applySensitivity(raw.bass, s),
    lowMid: applySensitivity(raw.lowMid, s),
    mid: applySensitivity(raw.mid, s),
    high: applySensitivity(raw.high, s * 1.4),
    volume: applySensitivity(raw.volume, s),
    beat,
  };
  return env.step(target, dt, settings.attack, settings.release);
}
