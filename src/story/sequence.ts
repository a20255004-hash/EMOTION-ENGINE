/**
 * Lógica pura de secuencias narrativas: duración, resolución del estado visual
 * en un instante (incluidas transiciones) y consistencia entre escenas.
 */
import { applyOperations, mixHex } from '../../shared/operations';
import { COLOR_PARAM_IDS, NUMERIC_PARAM_IDS, type VisualParams, type WorldId } from '../../shared/params';
import { worldPreset } from '../../shared/presets';
import { defaultAudioSettings, type AudioBinding, type ConsistencyLock, type StoryScene } from '../../shared/schema';

export interface ResolvedFrame {
  index: number;
  world: WorldId;
  params: VisualParams;
  bindings: AudioBinding[];
  fade: number;
  fadeColor: string;
  localTime: number;
  transition: { type: StoryScene['transition']['type']; progress: number } | null;
}

export function totalDuration(scenes: StoryScene[]): number {
  return scenes.reduce((a, s) => a + s.duration, 0);
}

export function sceneStartTimes(scenes: StoryScene[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const s of scenes) {
    out.push(t);
    t += s.duration;
  }
  return out;
}

export function lerpParams(a: VisualParams, b: VisualParams, t: number): VisualParams {
  const out = { ...b } as Record<string, unknown>;
  for (const id of NUMERIC_PARAM_IDS) out[id] = a[id] + (b[id] - a[id]) * t;
  for (const id of COLOR_PARAM_IDS) out[id] = mixHex(a[id], b[id], t);
  out.cameraMode = t < 0.5 ? a.cameraMode : b.cameraMode;
  return out as VisualParams;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** Estado visual de la secuencia en el instante `time` (segundos). */
export function resolveAt(scenes: StoryScene[], time: number, loop = false): ResolvedFrame | null {
  if (scenes.length === 0) return null;
  const total = totalDuration(scenes);
  let t = loop ? ((time % total) + total) % total : Math.min(Math.max(0, time), total - 1e-6);
  let index = 0;
  while (index < scenes.length - 1 && t >= scenes[index].duration) {
    t -= scenes[index].duration;
    index++;
  }
  const scene = scenes[index];
  const prev = index > 0 ? scenes[index - 1] : loop && scenes.length > 1 ? scenes[scenes.length - 1] : null;
  const base: ResolvedFrame = {
    index,
    world: scene.world,
    params: scene.params,
    bindings: scene.bindings ?? [],
    fade: 0,
    fadeColor: '#000000',
    localTime: t,
    transition: null,
  };
  const d = Math.min(scene.transition.duration, scene.duration * 0.8);
  if (scene.transition.type === 'cut' || d <= 0 || t >= d) return base;

  const p = t / d;
  const type = scene.transition.type;
  const viaColor = type === 'fade' || type === 'flash' || (type === 'morph' && (!prev || prev.world !== scene.world));
  if (type === 'morph' && prev && prev.world === scene.world) {
    return { ...base, params: lerpParams(prev.params, scene.params, ease(p)), transition: { type, progress: p } };
  }
  if (viaColor) {
    const color = type === 'flash' ? '#ffffff' : '#000000';
    if (!prev) return { ...base, fade: 1 - ease(p), fadeColor: color, transition: { type, progress: p } };
    if (p < 0.5) {
      return { ...base, index: index - 1 < 0 ? scenes.length - 1 : index - 1, world: prev.world, params: prev.params, bindings: prev.bindings ?? [], fade: ease(p * 2), fadeColor: color, transition: { type, progress: p } };
    }
    return { ...base, fade: ease(2 - p * 2), fadeColor: color, transition: { type, progress: p } };
  }
  return base;
}

const LOCK_PARAMS: Record<Exclude<ConsistencyLock, 'world'>, (keyof VisualParams)[]> = {
  palette: ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'particleColor', 'hueShift', 'saturation'],
  lighting: ['lightIntensity', 'lightColor', 'ambientIntensity', 'lightAngle', 'lightElevation'],
  particles: ['particleDensity', 'particleSize', 'particleSpeed', 'particleColor'],
  post: ['intensity', 'glowRadius', 'exposure', 'vignette', 'grain', 'chromatic'],
};

/**
 * Mantiene la consistencia: la primera escena actúa como estilo maestro y los
 * grupos bloqueados se copian al resto. Devuelve las escenas nuevas.
 */
export function applyConsistency(scenes: StoryScene[], locks: ConsistencyLock[]): StoryScene[] {
  if (scenes.length < 2 || locks.length === 0) return scenes;
  const ref = scenes[0];
  return scenes.map((s, i) => {
    if (i === 0) return s;
    let world = s.world;
    let params = { ...s.params } as Record<string, unknown>;
    if (locks.includes('world') && s.world !== ref.world) {
      world = ref.world;
      params = { ...worldPreset(ref.world), speed: s.params.speed, turbulence: s.params.turbulence, waveAmplitude: s.params.waveAmplitude, cameraMode: s.params.cameraMode };
    }
    for (const lock of locks) {
      if (lock === 'world') continue;
      for (const key of LOCK_PARAMS[lock]) params[key] = ref.params[key];
    }
    return { ...s, world, params: params as VisualParams };
  });
}

/** Construye los parámetros de una escena aplicando operaciones validadas sobre el preset del mundo. */
export function buildSceneParams(world: WorldId, ops: unknown[]): { world: WorldId; params: VisualParams; bindings: AudioBinding[]; rejected: number } {
  const r = applyOperations({ world, params: worldPreset(world), bindings: [], audioSettings: defaultAudioSettings() }, ops);
  return { world: r.state.world, params: r.state.params, bindings: r.state.bindings, rejected: r.rejected.length };
}
