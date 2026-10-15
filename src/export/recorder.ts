/**
 * Grabación de la experiencia en tiempo real: canvas.captureStream + pista de
 * audio de la Web Audio API → MediaRecorder. Es una grabación de lo que se
 * renderiza en el navegador (no un vídeo generado por IA ni un render offline).
 */
import type { ExportSettings } from '../../shared/schema';

export interface RecorderSupport {
  supported: boolean;
  reason: string | null;
  mimeTypes: { mime: string; ext: string; label: string; audio: boolean }[];
}

const CANDIDATES = [
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4', label: 'MP4 (H.264 + AAC)', audio: true },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', label: 'WebM (VP9 + Opus)', audio: true },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', label: 'WebM (VP8 + Opus)', audio: true },
  { mime: 'video/mp4', ext: 'mp4', label: 'MP4', audio: true },
  { mime: 'video/webm', ext: 'webm', label: 'WebM', audio: true },
];

export function recorderSupport(): RecorderSupport {
  if (typeof MediaRecorder === 'undefined') return { supported: false, reason: 'Este navegador no incluye MediaRecorder.', mimeTypes: [] };
  if (typeof HTMLCanvasElement === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) {
    return { supported: false, reason: 'Este navegador no permite capturar el lienzo como vídeo.', mimeTypes: [] };
  }
  const mimeTypes = CANDIDATES.filter((c) => MediaRecorder.isTypeSupported(c.mime));
  if (!mimeTypes.length) return { supported: false, reason: 'Ningún formato de vídeo es compatible con este navegador.', mimeTypes: [] };
  return { supported: true, reason: null, mimeTypes };
}

export const RESOLUTIONS: Record<ExportSettings['video']['resolution'], { label: string; size: (vw: number, vh: number) => { w: number; h: number } }> = {
  viewport: { label: 'Tamaño del escenario', size: (vw, vh) => ({ w: even(vw), h: even(vh) }) },
  '720p': { label: '1280 × 720 (16:9)', size: () => ({ w: 1280, h: 720 }) },
  '1080p': { label: '1920 × 1080 (16:9)', size: () => ({ w: 1920, h: 1080 }) },
  square: { label: '1080 × 1080 (1:1)', size: () => ({ w: 1080, h: 1080 }) },
  vertical: { label: '1080 × 1920 (9:16)', size: () => ({ w: 1080, h: 1920 }) },
};

function even(n: number) {
  return Math.max(2, Math.floor(n / 2) * 2);
}

export interface RecordingResult {
  blob: Blob;
  mime: string;
  ext: string;
  durationSec: number;
  hasAudio: boolean;
  width: number;
  height: number;
}

export interface RecordingHandle {
  stop(): void;
  done: Promise<RecordingResult>;
}

export function startRecording(opts: {
  canvas: HTMLCanvasElement;
  audio: MediaStream | null;
  fps: number;
  bitrateMbps: number;
  durationSec: number | null;
  mime: string;
  ext: string;
  onProgress?: (elapsedSec: number) => void;
  /** Se llama cuando el codificador entrega el primer fragmento (la grabación empieza de verdad). */
  onStarted?: () => void;
}): RecordingHandle {
  const video = opts.canvas.captureStream(opts.fps);
  const tracks = [...video.getVideoTracks()];
  const audioTracks = opts.audio?.getAudioTracks() ?? [];
  tracks.push(...audioTracks);
  const stream = new MediaStream(tracks);
  const recorder = new MediaRecorder(stream, {
    mimeType: opts.mime,
    videoBitsPerSecond: Math.round(opts.bitrateMbps * 1_000_000),
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  const requestedAt = performance.now();
  // El tiempo cuenta desde el primer fragmento: el arranque del codificador no recorta la duración.
  let startedAt: number | null = null;
  let failure: Error | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const done = new Promise<RecordingResult>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        if (startedAt === null) {
          startedAt = performance.now();
          opts.onStarted?.();
        }
      }
    };
    recorder.onerror = (e) => {
      clearInterval(timer);
      reject(new Error(`Error de grabación: ${(e as unknown as { error?: Error }).error?.message ?? 'desconocido'}`));
    };
    recorder.onstop = () => {
      clearInterval(timer);
      video.getTracks().forEach((t) => t.stop());
      const durationSec = startedAt === null ? 0 : (performance.now() - startedAt) / 1000;
      const blob = new Blob(chunks, { type: opts.mime.split(';')[0] });
      if (failure) reject(failure);
      else if (blob.size === 0) reject(new Error('La grabación está vacía. Comprueba que el escenario se está renderizando.'));
      else resolve({ blob, mime: opts.mime, ext: opts.ext, durationSec, hasAudio: audioTracks.length > 0, width: opts.canvas.width, height: opts.canvas.height });
    };
  });

  recorder.start(250);
  timer = setInterval(() => {
    if (startedAt === null) {
      if (performance.now() - requestedAt > 15000 && recorder.state === 'recording') {
        failure = new Error('El codificador de vídeo del navegador no respondió. Prueba otro formato o una resolución menor.');
        recorder.stop();
      }
      return;
    }
    const elapsed = (performance.now() - startedAt) / 1000;
    opts.onProgress?.(elapsed);
    if (opts.durationSec && elapsed >= opts.durationSec && recorder.state === 'recording') recorder.stop();
  }, 100);

  return {
    stop: () => {
      if (recorder.state === 'recording') recorder.stop();
    },
    done,
  };
}
