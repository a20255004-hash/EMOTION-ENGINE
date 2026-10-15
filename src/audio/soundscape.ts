/**
 * Paisajes sonoros generativos: cada escenario tiene su propio ambiente,
 * sintetizado en tiempo real con la Web Audio API (osciladores, ruido,
 * filtros y eventos aleatorios). Nada está pregrabado: se adapta a los
 * parámetros de la escena (velocidad, turbulencia, ondas) y, al pasar por el
 * analizador, también puede mover la imagen con las vinculaciones de audio.
 */
import type { VisualParams, WorldId } from '../../shared/params';
import { audioEngine } from './AudioEngine';

interface Voice {
  /** Se llama ~5 veces por segundo para programar eventos y seguir los parámetros. */
  tick(now: number, p: VisualParams): void;
  stop(at: number): void;
}

interface Kit {
  ctx: AudioContext;
  out: GainNode;
  noise: AudioBuffer;
  brown: AudioBuffer;
  nodes: AudioScheduledSourceNode[];
}

export const SOUNDSCAPE_INFO: Record<WorldId, string> = {
  ocean: 'Oleaje que respira, espuma y campanas lejanas',
  cosmos: 'Drones profundos, brillo estelar y pulsos de radio',
  atmosphere: 'Viento entre montañas y pájaros',
  aurora: 'Viento polar, coro etéreo y destellos de hielo',
  forest: 'Grillos, brisa entre hojas y un búho',
  neon: 'Synthwave a tempo con la velocidad de la escena',
  desert: 'Ráfagas de arena y una melodía de duduk',
  abyss: 'Rumor profundo, burbujas, sonar y cantos de ballena',
  crystal: 'Campanas de cristal con eco de caverna',
  vortex: 'Drone pulsante y ráfagas de energía',
};

// ---------- utilidades ----------
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function makeNoise(ctx: AudioContext, brown: boolean): AudioBuffer {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function loopNoise(k: Kit, brown = false): AudioBufferSourceNode {
  const s = k.ctx.createBufferSource();
  s.buffer = brown ? k.brown : k.noise;
  s.loop = true;
  s.loopStart = Math.random() * 2;
  s.start(0, Math.random() * 3);
  k.nodes.push(s);
  return s;
}

function lfo(k: Kit, freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') {
  const o = k.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = k.ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  k.nodes.push(o);
  return o;
}

function filter(k: Kit, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = k.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gain(k: Kit, v: number) {
  const g = k.ctx.createGain();
  g.gain.value = v;
  return g;
}

/** Nota con envolvente; se limpia sola al terminar. */
function note(
  k: Kit,
  dest: AudioNode,
  o: { freq: number; t: number; dur: number; vol: number; type?: OscillatorType; attack?: number; glideTo?: number; detune?: number },
) {
  const osc = k.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, o.t);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, o.t + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = k.ctx.createGain();
  const a = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(o.vol, o.t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  osc.connect(g).connect(dest);
  osc.start(o.t);
  osc.stop(o.t + o.dur + 0.05);
  osc.onended = () => g.disconnect();
}

/** Campana inarmónica (cristal, metal). */
function bell(k: Kit, dest: AudioNode, freq: number, t: number, vol: number, dur = 3) {
  for (const [ratio, v] of [
    [1, 1],
    [2.76, 0.45],
    [5.4, 0.25],
    [8.93, 0.12],
  ] as const) {
    note(k, dest, { freq: freq * ratio, t, dur: dur / Math.sqrt(ratio), vol: vol * v, attack: 0.003 });
  }
}

function noiseBurst(k: Kit, dest: AudioNode, t: number, dur: number, vol: number, f0: number, f1: number, q = 1) {
  const s = k.ctx.createBufferSource();
  s.buffer = k.noise;
  const f = filter(k, 'bandpass', f0, q);
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = k.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 2, dur + 0.1);
  s.onended = () => g.disconnect();
}

function echo(k: Kit, time: number, fb: number, wet: number): AudioNode {
  const input = k.ctx.createGain();
  const d = k.ctx.createDelay(2);
  d.delayTime.value = time;
  const f = k.ctx.createGain();
  f.gain.value = fb;
  const w = k.ctx.createGain();
  w.gain.value = wet;
  const lp = filter(k, 'lowpass', 3500);
  input.connect(k.out);
  input.connect(d);
  d.connect(lp).connect(f).connect(d);
  lp.connect(w).connect(k.out);
  return input;
}

/** Planificador de eventos aleatorios con intervalo variable. */
function every(min: number, max: number, fn: (t: number) => void) {
  let next = 0;
  return (now: number, scale = 1) => {
    if (next === 0) next = now + rand(min, max) * 0.4;
    while (next < now + 0.3) {
      fn(Math.max(next, now + 0.02));
      next += rand(min, max) / Math.max(0.2, scale);
    }
  };
}

const stopAll = (k: Kit, at: number) => {
  for (const n of k.nodes) {
    try {
      n.stop(at);
    } catch {
      /* ya detenido */
    }
  }
};

// ---------- recetas por escenario ----------
type Recipe = (k: Kit) => Voice;

const ocean: Recipe = (k) => {
  const surf = gain(k, 0.0);
  loopNoise(k, true).connect(filter(k, 'lowpass', 500)).connect(surf).connect(k.out);
  const swell = lfo(k, 0.1, 0.35, surf.gain);
  surf.gain.value = 0.45;
  const foam = gain(k, 0.02);
  loopNoise(k).connect(filter(k, 'highpass', 3000)).connect(foam).connect(k.out);
  lfo(k, 0.1, 0.02, foam.gain);
  const sub = k.ctx.createOscillator();
  sub.frequency.value = 55;
  sub.connect(gain(k, 0.03)).connect(k.out);
  sub.start();
  k.nodes.push(sub);
  const bells = echo(k, 0.45, 0.4, 0.5);
  const chimes = every(3, 8, (t) => bell(k, bells, mtof(pick([72, 74, 76, 79, 81, 84])), t, 0.04, 4));
  return {
    tick(now, p) {
      swell.frequency.setTargetAtTime(0.06 + p.speed * 0.06, now, 0.5);
      surf.gain.setTargetAtTime(0.25 + p.waveAmplitude * 0.25, now, 0.5);
      chimes(now, 0.5 + p.speed * 0.5);
    },
    stop: (at) => stopAll(k, at),
  };
};

const cosmos: Recipe = (k) => {
  const lp = filter(k, 'lowpass', 600, 2);
  const drone = gain(k, 0.05);
  for (const [f, d] of [
    [55, -6],
    [82.4, 5],
    [110, 0],
  ]) {
    const o = k.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(lp);
    o.start();
    k.nodes.push(o);
  }
  lp.connect(drone).connect(k.out);
  const sweep = lfo(k, 0.04, 450, lp.frequency);
  const shimmer = gain(k, 0.012);
  for (const f of [1760, 2637]) {
    const o = k.ctx.createOscillator();
    o.frequency.value = f;
    o.connect(shimmer);
    o.start();
    k.nodes.push(o);
  }
  shimmer.connect(k.out);
  lfo(k, 0.3, 0.01, shimmer.gain);
  const space = echo(k, 0.6, 0.5, 0.6);
  const pings = every(1.5, 4.5, (t) => note(k, space, { freq: mtof(pick([81, 84, 86, 88, 91, 93])), t, dur: 1.2, vol: 0.05, type: 'triangle' }));
  return {
    tick(now, p) {
      sweep.frequency.setTargetAtTime(0.02 + p.speed * 0.05, now, 1);
      lp.Q.setTargetAtTime(1 + p.turbulence * 6, now, 1);
      pings(now, 0.5 + p.speed * 0.6);
    },
    stop: (at) => stopAll(k, at),
  };
};

function wind(k: Kit, center: number, vol: number, q = 0.8) {
  const bp = filter(k, 'bandpass', center, q);
  const g = gain(k, vol);
  loopNoise(k).connect(bp).connect(g).connect(k.out);
  const sweep = lfo(k, 0.07, center * 0.5, bp.frequency);
  const gust = lfo(k, 0.11, vol * 0.6, g.gain);
  return { bp, g, sweep, gust };
}

const atmosphere: Recipe = (k) => {
  const w = wind(k, 600, 0.12);
  const birds = every(4, 11, (t) => {
    const n = 2 + Math.floor(Math.random() * 4);
    const base = rand(2400, 3600);
    for (let i = 0; i < n; i++) note(k, k.out, { freq: base, glideTo: base * rand(1.2, 1.6), t: t + i * 0.13, dur: 0.09, vol: 0.03 });
  });
  return {
    tick(now, p) {
      w.g.gain.setTargetAtTime(0.06 + p.turbulence * 0.08, now, 1);
      w.sweep.frequency.setTargetAtTime(0.04 + p.speed * 0.06, now, 1);
      birds(now);
    },
    stop: (at) => stopAll(k, at),
  };
};

const aurora: Recipe = (k) => {
  const w = wind(k, 1800, 0.035, 0.5);
  const choir = gain(k, 0.0);
  const lp = filter(k, 'lowpass', 1800);
  choir.connect(lp).connect(k.out);
  const chords = [
    [62, 65, 69, 76],
    [58, 65, 70, 74],
    [60, 64, 67, 74],
    [57, 64, 69, 72],
  ];
  const voices: OscillatorNode[] = [];
  for (let i = 0; i < 4; i++) {
    const o = k.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(chords[0][i]);
    lfo(k, 4 + i * 0.3, 3, o.detune);
    o.connect(choir);
    o.start();
    k.nodes.push(o);
    voices.push(o);
  }
  choir.gain.value = 0.025;
  let ci = 0;
  const change = every(10, 14, (t) => {
    ci = (ci + 1) % chords.length;
    voices.forEach((o, i) => o.frequency.setTargetAtTime(mtof(chords[ci][i]), t, 1.5));
  });
  const ice = echo(k, 0.33, 0.45, 0.6);
  const tinkles = every(0.8, 3, (t) => note(k, ice, { freq: mtof(pick([86, 88, 91, 93, 96, 98])), t, dur: 0.6, vol: 0.025 }));
  return {
    tick(now, p) {
      w.g.gain.setTargetAtTime(0.02 + p.turbulence * 0.04, now, 1);
      change(now);
      tinkles(now, 0.4 + p.particleDensity);
    },
    stop: (at) => stopAll(k, at),
  };
};

const forest: Recipe = (k) => {
  const crickets: GainNode[] = [];
  for (const [f, rate] of [
    [4300, 28],
    [5100, 34],
  ]) {
    const o = k.ctx.createOscillator();
    o.frequency.value = f;
    const am = gain(k, 0);
    const env = gain(k, 0.012);
    o.connect(am).connect(env).connect(k.out);
    o.start();
    k.nodes.push(o);
    lfo(k, rate, 1, am.gain, 'square');
    lfo(k, rand(0.3, 0.6), 0.012, env.gain);
    crickets.push(env);
  }
  const leaves = wind(k, 2200, 0.015, 0.6);
  const owl = every(12, 22, (t) => {
    for (const [dt, f] of [
      [0, 390],
      [0.55, 370],
      [0.9, 370],
    ]) note(k, k.out, { freq: f, glideTo: f * 0.92, t: t + dt, dur: 0.35, vol: 0.05, attack: 0.05 });
  });
  return {
    tick(now, p) {
      leaves.g.gain.setTargetAtTime(0.008 + p.turbulence * 0.02, now, 1);
      owl(now);
    },
    stop: (at) => stopAll(k, at),
  };
};

const neon: Recipe = (k) => {
  const lp = filter(k, 'lowpass', 1400, 4);
  const synth = gain(k, 0.05);
  lp.connect(synth).connect(echo(k, 0.375, 0.3, 0.35));
  lfo(k, 0.05, 700, lp.frequency);
  const prog = [
    [57, 60, 64, 67],
    [53, 57, 60, 65],
    [48, 52, 55, 60],
    [55, 59, 62, 67],
  ];
  let step = 0;
  let next = 0;
  return {
    tick(now, p) {
      const bpm = 84 + p.speed * 36;
      const s16 = 60 / bpm / 4;
      if (next < now) next = now + 0.05;
      while (next < now + 0.3) {
        const bar = Math.floor(step / 16) % 4;
        const chord = prog[bar];
        const n = chord[step % 4] + (step % 8 >= 4 ? 12 : 0);
        note(k, lp, { freq: mtof(n), t: next, dur: s16 * 0.9, vol: 0.5, type: 'sawtooth', detune: 6 });
        if (step % 2 === 0) note(k, k.out, { freq: mtof(chord[0] - 24), t: next, dur: s16 * 1.8, vol: 0.08, type: 'sawtooth' });
        if (step % 4 === 0) note(k, k.out, { freq: 120, glideTo: 40, t: next, dur: 0.25, vol: 0.18 });
        if (step % 8 === 4) noiseBurst(k, k.out, next, 0.18, 0.08, 1800, 1200, 0.8);
        step++;
        next += s16;
      }
      lp.Q.setTargetAtTime(2 + p.turbulence * 6, now, 0.5);
    },
    stop: (at) => stopAll(k, at),
  };
};

const desert: Recipe = (k) => {
  const w = wind(k, 300, 0.12, 0.6);
  const hiss = gain(k, 0.01);
  loopNoise(k).connect(filter(k, 'highpass', 4500)).connect(hiss).connect(k.out);
  lfo(k, 0.11, 0.01, hiss.gain);
  const drone = gain(k, 0.03);
  for (const f of [98, 146.8]) {
    const o = k.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    lfo(k, 0.2, 4, o.detune);
    o.connect(drone);
    o.start();
    k.nodes.push(o);
  }
  drone.connect(k.out);
  const duduk = filter(k, 'lowpass', 1600, 1);
  duduk.connect(echo(k, 0.5, 0.35, 0.4));
  const scale = [64, 65, 68, 69, 71, 72, 74, 76];
  const melody = every(8, 14, (t) => {
    let idx = Math.floor(Math.random() * 4);
    let tt = t;
    for (let i = 0; i < 4; i++) {
      idx = Math.max(0, Math.min(scale.length - 1, idx + pick([-1, 1, 1, 2, -2])));
      const dur = pick([0.6, 0.9, 1.4]);
      note(k, duduk, { freq: mtof(scale[idx]), t: tt, dur, vol: 0.06, type: 'sawtooth', attack: 0.12 });
      tt += dur * 0.85;
    }
  });
  return {
    tick(now, p) {
      w.g.gain.setTargetAtTime(0.06 + p.turbulence * 0.12, now, 1);
      melody(now);
    },
    stop: (at) => stopAll(k, at),
  };
};

const abyss: Recipe = (k) => {
  const rumble = gain(k, 0.5);
  loopNoise(k, true).connect(filter(k, 'lowpass', 180)).connect(rumble).connect(k.out);
  lfo(k, 0.05, 0.2, rumble.gain);
  const water = filter(k, 'lowpass', 900);
  water.connect(echo(k, 0.7, 0.45, 0.5));
  const bubbles = every(0.4, 2.2, (t) => {
    const n = 1 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const f = rand(250, 700);
      note(k, k.out, { freq: f, glideTo: f * rand(2, 3), t: t + i * rand(0.04, 0.12), dur: 0.06, vol: 0.05 });
    }
  });
  const sonar = every(9, 14, (t) => note(k, water, { freq: 1180, t, dur: 2.2, vol: 0.05 }));
  const whale = every(14, 24, (t) => {
    const o = k.ctx.createOscillator();
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 1.8);
    o.frequency.exponentialRampToValueAtTime(260, t + 4);
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    const vib = k.ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = k.ctx.createGain();
    vg.gain.value = 8;
    vib.connect(vg).connect(o.detune);
    vib.start(t);
    vib.stop(t + 4.3);
    o.connect(g).connect(water);
    o.start(t);
    o.stop(t + 4.3);
    o.onended = () => g.disconnect();
  });
  return {
    tick(now, p) {
      bubbles(now, 0.4 + p.particleDensity);
      sonar(now);
      whale(now);
    },
    stop: (at) => stopAll(k, at),
  };
};

const crystal: Recipe = (k) => {
  const cave = echo(k, 0.42, 0.55, 0.7);
  const drone = k.ctx.createOscillator();
  drone.frequency.value = 73.4;
  drone.connect(gain(k, 0.04)).connect(k.out);
  drone.start();
  k.nodes.push(drone);
  const bells = every(0.8, 2.6, (t) => bell(k, cave, mtof(pick([74, 76, 78, 81, 83, 86, 88])), t, 0.035, 3.5));
  const drips = every(3, 7, (t) => note(k, cave, { freq: 1500, glideTo: 600, t, dur: 0.08, vol: 0.04 }));
  return {
    tick(now, p) {
      bells(now, 0.5 + p.complexity);
      drips(now);
    },
    stop: (at) => stopAll(k, at),
  };
};

const vortex: Recipe = (k) => {
  const lp = filter(k, 'lowpass', 800, 6);
  const pulse = gain(k, 0.5);
  const out = gain(k, 0.06);
  for (const d of [-8, 8]) {
    const o = k.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 73.4;
    o.detune.value = d;
    o.connect(lp);
    o.start();
    k.nodes.push(o);
  }
  lp.connect(pulse).connect(out).connect(k.out);
  const trem = lfo(k, 4, 0.45, pulse.gain, 'square');
  const sweep = lfo(k, 0.1, 600, lp.frequency);
  const sub = k.ctx.createOscillator();
  sub.frequency.value = 36.7;
  sub.connect(gain(k, 0.06)).connect(k.out);
  sub.start();
  k.nodes.push(sub);
  const whoosh = every(2, 4.5, (t) => noiseBurst(k, k.out, t, 1.4, 0.07, 300, 4000, 1.5));
  return {
    tick(now, p) {
      trem.frequency.setTargetAtTime(2 + p.speed * 4, now, 0.3);
      sweep.frequency.setTargetAtTime(0.05 + p.speed * 0.15, now, 0.5);
      lp.Q.setTargetAtTime(3 + p.turbulence * 8, now, 0.5);
      whoosh(now, 0.5 + p.speed * 0.6);
    },
    stop: (at) => stopAll(k, at),
  };
};

const RECIPES: Record<WorldId, Recipe> = { ocean, cosmos, atmosphere, aurora, forest, neon, desert, abyss, crystal, vortex };

interface Active {
  world: WorldId;
  voice: Voice;
  out: GainNode;
}

/** Controla qué paisaje suena, con fundido cruzado al cambiar de escenario. */
class SoundscapeEngine {
  private current: Active | null = null;
  private enabled = false;
  private volume = 0.6;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private world: WorldId = 'ocean';
  private params: VisualParams | null = null;
  private listeners = new Set<(on: boolean) => void>();

  get isPlaying() {
    return this.enabled && !!this.current;
  }

  subscribe(fn: (on: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Debe llamarse desde un gesto del usuario la primera vez (política de autoplay). */
  start() {
    const ctx = audioEngine.ensure();
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(audioEngine.ambienceInput());
      this.noise = makeNoise(ctx, false);
      this.brown = makeNoise(ctx, true);
    }
    this.enabled = true;
    audioEngine.ambienceOn = true;
    this.switchTo(this.world);
    this.timer ??= setInterval(() => this.tick(), 200);
    this.emit();
  }

  stop() {
    this.enabled = false;
    audioEngine.ambienceOn = false;
    this.fadeOut(this.current, 0.6);
    this.current = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emit();
  }

  setVolume(v: number) {
    this.volume = v;
    const ctx = audioEngine.context;
    if (this.master && ctx) this.master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
  }

  /** Sigue al escenario que se ve (estudio o secuencia). */
  follow(world: WorldId, params: VisualParams) {
    this.params = params;
    if (world !== this.world) {
      this.world = world;
      if (this.enabled) this.switchTo(world);
    }
  }

  private emit() {
    for (const l of this.listeners) l(this.isPlaying);
  }

  private switchTo(world: WorldId) {
    const ctx = audioEngine.context;
    if (!ctx || !this.master || !this.noise || !this.brown) return;
    if (this.current?.world === world) return;
    this.fadeOut(this.current, 1.5);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2);
    out.connect(this.master);
    const kit: Kit = { ctx, out, noise: this.noise, brown: this.brown, nodes: [] };
    this.current = { world, voice: RECIPES[world](kit), out };
  }

  private fadeOut(a: Active | null, secs: number) {
    const ctx = audioEngine.context;
    if (!a || !ctx) return;
    const t = ctx.currentTime;
    a.out.gain.cancelScheduledValues(t);
    a.out.gain.setValueAtTime(Math.max(0.0001, a.out.gain.value), t);
    a.out.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    a.voice.stop(t + secs + 0.1);
    setTimeout(() => a.out.disconnect(), (secs + 0.5) * 1000);
  }

  private tick() {
    const ctx = audioEngine.context;
    if (!ctx || !this.current || !this.params || ctx.state !== 'running') return;
    this.current.voice.tick(ctx.currentTime, this.params);
  }
}

export const soundscape = new SoundscapeEngine();
