/**
 * Reproducción y análisis de audio con la Web Audio API.
 *
 * Grafo: fuente (pista o micrófono) → analyser → ganancia → altavoces
 *                                              ↘ destino de grabación (MediaStream)
 * El micrófono no se envía a los altavoces para evitar realimentación.
 */
import type { AudioSettings } from '../../shared/schema';
import { SILENT_FRAME, type AudioFrame } from '../engine/types';
import { BeatDetector, Envelope, bandLevels, processFrame, type RawBands } from './analysis';

export type AudioInput = 'none' | 'track' | 'mic';

export interface AudioState {
  input: AudioInput;
  trackId: string | null;
  playing: boolean;
  duration: number;
  currentTime: number;
  loop: boolean;
  error: string | null;
  contextState: AudioContextState | 'uninitialized';
}

export const SUPPORTED_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-flac', 'audio/aac', 'audio/mp4', 'audio/x-m4a'];
export const MAX_AUDIO_BYTES = 60 * 1024 * 1024;

class AudioEngineImpl {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private freq: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private wave: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private beat = new BeatDetector();
  private env = new Envelope();
  private lastFrameAt = 0;
  private settings: Pick<AudioSettings, 'sensitivity' | 'attack' | 'release'> = { sensitivity: 1, attack: 0.6, release: 0.25 };
  private listeners = new Set<(s: AudioState) => void>();

  state: AudioState = { input: 'none', trackId: null, playing: false, duration: 0, currentTime: 0, loop: true, error: null, contextState: 'uninitialized' };
  lastRaw: RawBands = { bass: 0, lowMid: 0, mid: 0, high: 0, volume: 0 };
  lastFrame: AudioFrame = { ...SILENT_FRAME };

  /** Crea el contexto (debe llamarse tras un gesto del usuario). */
  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Este navegador no soporta la Web Audio API.');
      this.ctx = new Ctor();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.6;
      this.gain = this.ctx.createGain();
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.analyser.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      this.gain.connect(this.recordDest);
      this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.wave = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.ctx.onstatechange = () => this.emit({ contextState: this.ctx!.state });
      // Ciclo de análisis propio (~60 Hz): no depende de los fps del escenario.
      setInterval(() => this.tick(), 16);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get context() {
    return this.ctx;
  }

  subscribe(fn: (s: AudioState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<AudioState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  configure(settings: Pick<AudioSettings, 'smoothing' | 'volume' | 'loop' | 'sensitivity' | 'attack' | 'release'>) {
    this.settings = { sensitivity: settings.sensitivity, attack: settings.attack, release: settings.release };
    if (this.analyser) this.analyser.smoothingTimeConstant = settings.smoothing;
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(settings.volume, this.ctx.currentTime, 0.02);
    if (this.source) this.source.loop = settings.loop;
    if (this.state.loop !== settings.loop) this.emit({ loop: settings.loop });
  }

  async decode(trackId: string, blob: Blob): Promise<AudioBuffer> {
    const cached = this.buffers.get(trackId);
    if (cached) return cached;
    const ctx = this.ensure();
    const data = await blob.arrayBuffer();
    try {
      const buf = await ctx.decodeAudioData(data);
      this.buffers.set(trackId, buf);
      return buf;
    } catch {
      throw new Error('No se pudo decodificar el audio. Formatos admitidos por este navegador: MP3, WAV, OGG, M4A/AAC, FLAC o WebM.');
    }
  }

  async loadTrack(trackId: string, blob: Blob) {
    const buf = await this.decode(trackId, blob);
    this.stopSource();
    this.stopMic();
    this.buffer = buf;
    this.offset = 0;
    this.beat.reset();
    this.emit({ input: 'track', trackId, duration: buf.duration, currentTime: 0, playing: false, error: null });
    return buf;
  }

  play(fromOffset?: number) {
    const ctx = this.ensure();
    if (!this.buffer || !this.analyser) return;
    this.stopSource();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.state.loop;
    src.connect(this.analyser);
    const off = Math.max(0, Math.min(fromOffset ?? this.offset, this.buffer.duration - 0.01));
    src.start(0, off);
    src.onended = () => {
      if (this.source === src && !src.loop) {
        this.source = null;
        this.offset = 0;
        this.emit({ playing: false, currentTime: 0 });
      }
    };
    this.source = src;
    this.startedAt = ctx.currentTime - off;
    this.emit({ playing: true, input: 'track' });
  }

  pause() {
    if (!this.source || !this.ctx) return;
    this.offset = this.currentTime;
    this.stopSource();
    this.emit({ playing: false, currentTime: this.offset });
  }

  stop() {
    this.stopSource();
    this.offset = 0;
    this.emit({ playing: false, currentTime: 0 });
  }

  seek(sec: number) {
    this.offset = Math.max(0, Math.min(sec, this.buffer?.duration ?? 0));
    if (this.state.playing) this.play(this.offset);
    else this.emit({ currentTime: this.offset });
  }

  get currentTime(): number {
    if (!this.ctx || !this.buffer) return 0;
    if (!this.source) return this.offset;
    const t = this.ctx.currentTime - this.startedAt;
    return this.state.loop ? t % this.buffer.duration : Math.min(t, this.buffer.duration);
  }

  private stopSource() {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* ya detenida */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  async startMic() {
    const ctx = this.ensure();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite acceder al micrófono.');
    this.stopSource();
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      throw new Error(name === 'NotAllowedError' ? 'Permiso de micrófono denegado.' : 'No se encontró un micrófono disponible.');
    }
    this.micSource = ctx.createMediaStreamSource(this.micStream);
    // Solo al analizador: no se reproduce por los altavoces.
    this.micSource.connect(this.analyser!);
    this.analyser!.disconnect();
    this.beat.reset();
    this.emit({ input: 'mic', playing: true, trackId: null, duration: 0, currentTime: 0, error: null });
  }

  stopMic() {
    if (!this.micStream) return;
    this.micStream.getTracks().forEach((t) => t.stop());
    this.micSource?.disconnect();
    this.micStream = null;
    this.micSource = null;
    // Restaura la salida del analizador hacia altavoces y grabación.
    this.analyser?.connect(this.gain!);
    this.emit({ input: this.buffer ? 'track' : 'none', playing: false });
  }

  unload() {
    this.stopSource();
    this.stopMic();
    this.buffer = null;
    this.offset = 0;
    this.emit({ input: 'none', trackId: null, playing: false, duration: 0, currentTime: 0 });
  }

  forget(trackId: string) {
    this.buffers.delete(trackId);
    if (this.state.trackId === trackId) this.unload();
  }

  get active() {
    return !!this.analyser && (!!this.source || !!this.micSource);
  }

  /** Última señal procesada (la produce el ciclo de análisis). */
  analyse(settings?: Pick<AudioSettings, 'sensitivity' | 'attack' | 'release'>): AudioFrame {
    if (settings) this.settings = { sensitivity: settings.sensitivity, attack: settings.attack, release: settings.release };
    return this.lastFrame;
  }

  private tick() {
    const settings = this.settings;
    const now = performance.now();
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 1 / 60;
    this.lastFrameAt = now;
    let raw: RawBands = { bass: 0, lowMid: 0, mid: 0, high: 0, volume: 0 };
    if (this.analyser && this.ctx && this.active) {
      this.analyser.getByteFrequencyData(this.freq);
      raw = bandLevels(this.freq, this.ctx.sampleRate, this.analyser.fftSize);
    }
    this.lastRaw = raw;
    const beat = this.beat.step(raw.bass, dt, settings.sensitivity);
    this.lastFrame = processFrame(raw, beat, settings, this.env, dt);
  }

  get bpm() {
    return this.beat.bpmEstimate;
  }

  getSpectrum(): Uint8Array {
    return this.freq;
  }
  getWaveform(): Uint8Array {
    if (this.analyser && this.active) this.analyser.getByteTimeDomainData(this.wave);
    return this.wave;
  }

  /** Flujo de audio para grabar junto con el lienzo (null si no hay contexto). */
  recordingStream(): MediaStream | null {
    return this.recordDest?.stream ?? null;
  }
}

export const audioEngine = new AudioEngineImpl();
