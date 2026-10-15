import { encodeWav } from '../../shared/wav';

/**
 * Sintetiza en el navegador una pista de demostración real (no es una
 * grabación incluida): bombo, caja, charles, bajo y acordes de pad a 116 BPM.
 * Sirve para probar el análisis y las vinculaciones sin tener archivos propios.
 */
export async function renderDemoTrack(seconds = 24): Promise<Blob> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const bpm = 116;
  const beat = 60 / bpm;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

  // Ruido reutilizable para caja y charles.
  const noise = ctx.createBuffer(1, sampleRate, sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const kick = (t: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(1.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.45);
  };
  const snare = (t: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5, 0.25);
  };
  const hat = (t: number, open = false) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(open ? 0.22 : 0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.25 : 0.05));
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5, 0.3);
  };
  const note = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  const bass = (t: number, midi: number, dur: number) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = note(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const pad = (t: number, midis: number[], dur: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1600;
    g.connect(f).connect(master);
    for (const m of midis) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = note(m);
        o.detune.value = detune;
        o.connect(g);
        o.start(t);
        o.stop(t + dur);
      }
    }
  };

  // La menor – Fa – Do – Sol
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62],
  ];
  const roots = [33, 29, 36, 31];
  const bars = Math.ceil(seconds / (beat * 4));
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * beat * 4;
    const ci = bar % 4;
    pad(t0, chords[ci], beat * 4);
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beat;
      if (t >= seconds) break;
      if (bar > 0 || b > 1) kick(t);
      if (b % 2 === 1 && bar > 1) snare(t);
      hat(t + beat / 2, b === 3);
      if (bar > 0) hat(t + beat / 4);
      bass(t, roots[ci] + (b === 2 ? 12 : 0), beat * 0.9);
    }
  }

  const buf = await ctx.startRendering();
  const channels = [buf.getChannelData(0), buf.getChannelData(1)];
  // Fundido final para que el bucle no haga clic.
  const fade = Math.floor(sampleRate * 0.05);
  for (const ch of channels) for (let i = 0; i < fade; i++) ch[ch.length - 1 - i] *= i / fade;
  return new Blob([encodeWav(channels, sampleRate)], { type: 'audio/wav' });
}
