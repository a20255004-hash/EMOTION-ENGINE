import type { Config } from '../config';
import { HttpError } from '../http';
import { encodeWav } from '../../shared/wav';

export interface MusicResult {
  audio: Buffer;
  mime: string;
  durationSec: number;
}

/** Contrato de un proveedor de generación musical. Sustituible por configuración. */
export interface MusicProvider {
  readonly id: string;
  readonly isMock: boolean;
  generate(args: { prompt: string; durationSec: number; signal: AbortSignal }): Promise<MusicResult>;
}

/**
 * Proveedor de PRUEBA: sintetiza en el servidor un patrón procedural derivado
 * del texto. No es IA; existe para verificar el flujo completo (petición,
 * límites, errores, guardado de la pista) sin depender de un servicio externo.
 */
class MockMusicProvider implements MusicProvider {
  readonly id = 'mock';
  readonly isMock = true;
  async generate({ prompt, durationSec, signal }: { prompt: string; durationSec: number; signal: AbortSignal }): Promise<MusicResult> {
    let h = 2166136261;
    for (const ch of prompt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
    const sr = 22050;
    const n = Math.floor(durationSec * sr);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const bpm = 80 + Math.floor(rnd() * 60);
    const root = 40 + Math.floor(rnd() * 12);
    const scale = [0, 3, 5, 7, 10, 12];
    const beat = (60 / bpm) * sr;
    const notes = Array.from({ length: 16 }, () => root + 12 + scale[Math.floor(rnd() * scale.length)]);
    const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    for (let i = 0; i < n; i++) {
      if (i % 50000 === 0 && signal.aborted) throw new HttpError(499, 'aborted', 'Generación cancelada.');
      const t = i / sr;
      const b = i / beat;
      const inBeat = (b % 1) * (60 / bpm);
      const kick = Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-inBeat * 30)) * inBeat) * Math.exp(-inBeat * 7) * 0.8;
      const step = Math.floor(b * 2) % 16;
      const inStep = ((b * 2) % 1) * (30 / bpm);
      const lead = Math.sin(2 * Math.PI * freq(notes[step]) * t) * Math.exp(-inStep * 4) * 0.18;
      const pad = (Math.sin(2 * Math.PI * freq(root + 12) * t) + Math.sin(2 * Math.PI * freq(root + 19) * t * 1.002)) * 0.07;
      const env = Math.min(1, t / 0.5, (durationSec - t) / 0.5);
      L[i] = (kick + lead * 0.8 + pad) * env;
      R[i] = (kick + lead * 1.2 + pad) * env;
    }
    return { audio: Buffer.from(encodeWav([L, R], sr)), mime: 'audio/wav', durationSec };
  }
}

/**
 * Adaptador HTTP genérico. Envía {prompt, duration_seconds} con la clave del
 * servidor y acepta audio binario o JSON con `audio_url` / `audio_base64`.
 * Para un proveedor con otro contrato, crea un adaptador nuevo con esta interfaz.
 */
class HttpMusicProvider implements MusicProvider {
  readonly id = 'http';
  readonly isMock = false;
  constructor(private url: string, private key: string | null) {}

  async generate({ prompt, durationSec, signal }: { prompt: string; durationSec: number; signal: AbortSignal }): Promise<MusicResult> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Accept: 'audio/*, application/json', ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}) },
        body: JSON.stringify({ prompt, duration_seconds: durationSec }),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new HttpError(502, 'provider_unreachable', 'No se pudo conectar con el servicio de música.');
    }
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'provider_auth', 'Credenciales del servicio de música no válidas.');
    if (res.status === 402) throw new HttpError(402, 'provider_quota', 'El servicio de música indica saldo o cuota insuficiente.');
    if (res.status === 429) throw new HttpError(429, 'provider_rate_limited', 'El servicio de música está limitando las peticiones.');
    if (!res.ok) throw new HttpError(502, 'provider_error', `Error del servicio de música (${res.status}).`);
    const type = res.headers.get('content-type') ?? '';
    if (type.startsWith('audio/')) return { audio: Buffer.from(await res.arrayBuffer()), mime: type.split(';')[0], durationSec };
    const body = (await res.json().catch(() => null)) as { audio_url?: string; audio_base64?: string; mime?: string } | null;
    if (body?.audio_base64) return { audio: Buffer.from(body.audio_base64, 'base64'), mime: body.mime ?? 'audio/mpeg', durationSec };
    if (body?.audio_url && /^https:\/\//.test(body.audio_url)) {
      const a = await fetch(body.audio_url, { signal });
      if (!a.ok) throw new HttpError(502, 'provider_error', 'No se pudo descargar el audio generado.');
      return { audio: Buffer.from(await a.arrayBuffer()), mime: a.headers.get('content-type')?.split(';')[0] ?? 'audio/mpeg', durationSec };
    }
    throw new HttpError(502, 'invalid_output', 'El servicio de música devolvió una respuesta sin audio.');
  }
}

export function createMusicProvider(cfg: Config['music']): { provider: MusicProvider | null; reason: string | null } {
  if (cfg.provider === 'mock') return { provider: new MockMusicProvider(), reason: null };
  if (cfg.provider === 'http') {
    if (!cfg.url) return { provider: null, reason: 'MUSIC_PROVIDER=http pero falta MUSIC_API_URL en el servidor.' };
    return { provider: new HttpMusicProvider(cfg.url, cfg.key), reason: null };
  }
  return { provider: null, reason: 'No hay proveedor de música configurado (MUSIC_PROVIDER=none).' };
}

/** Cupo diario global (memoria del proceso; se reinicia a medianoche UTC). */
export class DailyQuota {
  private day = '';
  private used = 0;
  constructor(private limit: number) {}
  private roll() {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.used = 0;
    }
  }
  remaining() {
    this.roll();
    return Math.max(0, this.limit - this.used);
  }
  take() {
    this.roll();
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
  refund() {
    this.used = Math.max(0, this.used - 1);
  }
}
