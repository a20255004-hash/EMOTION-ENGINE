/**
 * Plantillas narrativas y generador local de secuencias a partir de una idea.
 * Todo se construye con operaciones validadas sobre los presets reales del motor.
 */
import type { Operation } from '../../shared/operations';
import { createScene } from '../../shared/projectFactory';
import type { WorldId } from '../../shared/params';
import { WORLDS, type MoodId } from '../../shared/presets';
import type { StoryScene, TransitionType } from '../../shared/schema';
import type { StoryPlan } from '../../shared/aiContract';
import { interpretLocally } from '../nlp/localInterpreter';
import { buildSceneParams } from './sequence';

interface TemplateScene {
  name: string;
  description: string;
  world: WorldId;
  duration: number;
  transition: TransitionType;
  mood?: MoodId;
  ops?: Operation[];
}

export interface StoryTemplate {
  id: string;
  name: string;
  summary: string;
  scenes: TemplateScene[];
}

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    id: 'sea-to-stars',
    name: 'Del mar a las estrellas',
    summary: 'Un viaje que empieza en un océano en calma y termina dentro de una galaxia.',
    scenes: [
      { name: 'Marea dormida', description: 'Un mar nocturno respira bajo una luna enorme.', world: 'ocean', duration: 8, transition: 'fade', mood: 'serene' },
      { name: 'Despertar bioluminiscente', description: 'El agua se enciende y el plancton asciende hacia el cielo.', world: 'ocean', duration: 8, transition: 'morph', mood: 'dreamy', ops: [{ op: 'scaleNumber', param: 'particleDensity', factor: 1.8 }, { op: 'scaleNumber', param: 'waveAmplitude', factor: 1.4 }] },
      { name: 'Umbral', description: 'Atravesamos el horizonte y la geometría del cosmos aparece.', world: 'cosmos', duration: 8, transition: 'flash', mood: 'mysterious' },
      { name: 'Corazón de la galaxia', description: 'El núcleo late con fuerza rodeado de órbitas infinitas.', world: 'cosmos', duration: 10, transition: 'morph', mood: 'epic', ops: [{ op: 'setCameraMode', mode: 'flythrough' }] },
    ],
  },
  {
    id: 'mountain-dawn',
    name: 'Amanecer en la cordillera',
    summary: 'De la noche al mediodía sobre un valle cubierto de niebla.',
    scenes: [
      { name: 'Noche azul', description: 'Las cumbres apenas se intuyen entre la bruma.', world: 'atmosphere', duration: 8, transition: 'fade', mood: 'cold', ops: [{ op: 'setNumber', param: 'lightElevation', value: 3 }, { op: 'setColor', param: 'backgroundColor', value: '#1a2340' }, { op: 'scaleNumber', param: 'lightIntensity', factor: 0.5 }] },
      { name: 'Primera luz', description: 'El sol rompe el horizonte y tiñe la niebla de oro.', world: 'atmosphere', duration: 9, transition: 'morph', mood: 'warm', ops: [{ op: 'setNumber', param: 'lightElevation', value: 8 }, { op: 'setColor', param: 'backgroundColor', value: '#f0a070' }] },
      { name: 'Vuelo sobre el valle', description: 'Volamos entre las montañas mientras la niebla se disipa.', world: 'atmosphere', duration: 10, transition: 'morph', mood: 'epic', ops: [{ op: 'setNumber', param: 'lightElevation', value: 35 }, { op: 'setCameraMode', mode: 'flythrough' }, { op: 'scaleNumber', param: 'fogDensity', factor: 0.5 }, { op: 'setColor', param: 'backgroundColor', value: '#b8d4ee' }] },
    ],
  },
  {
    id: 'cosmic-pulse',
    name: 'Pulso cósmico',
    summary: 'Una pieza para música electrónica: el universo reacciona al ritmo.',
    scenes: [
      { name: 'Latencia', description: 'Un núcleo en reposo espera la primera nota.', world: 'cosmos', duration: 6, transition: 'fade', mood: 'serene' },
      { name: 'Ignición', description: 'Los graves golpean y el núcleo se expande con cada pulso.', world: 'cosmos', duration: 10, transition: 'flash', mood: 'euphoric', ops: [{ op: 'bindAudio', source: 'bass', target: 'scale', amount: 0.35 }, { op: 'bindAudio', source: 'beat', target: 'intensity', amount: 0.4 }] },
      { name: 'Tormenta', description: 'Todo se vuelve rojo y caótico.', world: 'cosmos', duration: 8, transition: 'morph', mood: 'ominous', ops: [{ op: 'bindAudio', source: 'high', target: 'chromatic', amount: 0.5 }] },
      { name: 'Silencio estelar', description: 'La energía se disuelve en polvo de estrellas.', world: 'cosmos', duration: 8, transition: 'fade', mood: 'dreamy', ops: [{ op: 'scaleNumber', param: 'speed', factor: 0.5 }] },
    ],
  },
];

function toScene(t: TemplateScene): StoryScene {
  const ops: Operation[] = [...(t.mood ? [{ op: 'applyMood', mood: t.mood, strength: 0.85 } as Operation] : []), ...(t.ops ?? [])];
  const built = buildSceneParams(t.world, ops);
  return createScene(built.world, {
    name: t.name,
    description: t.description,
    duration: t.duration,
    params: built.params,
    bindings: built.bindings.length ? built.bindings : undefined,
    transition: { type: t.transition, duration: t.transition === 'cut' ? 0 : t.transition === 'flash' ? 0.8 : 1.6 },
  });
}

export function scenesFromTemplate(id: string): StoryScene[] {
  const tpl = STORY_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return [];
  return tpl.scenes.map(toScene);
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function detectWorld(text: string): WorldId | null {
  const t = strip(text);
  let best: { id: WorldId; score: number } | null = null;
  for (const w of Object.values(WORLDS)) {
    const score = w.keywords.filter((k) => t.includes(strip(k))).length;
    if (score > 0 && (!best || score > best.score)) best = { id: w.id, score };
  }
  return best?.id ?? null;
}

function titleFrom(sentence: string): string {
  const words = sentence.replace(/[.,;:!?¡¿"«»]/g, '').trim().split(/\s+/).slice(0, 5).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Escena';
}

export interface LocalStoryResult {
  scenes: StoryScene[];
  notes: string[];
}

/**
 * Generador local: divide la idea en momentos (frases o marcadores temporales),
 * elige el mundo por palabras clave e interpreta cada frase con el intérprete
 * local para fijar atmósfera, colores y movimiento. No inventa escenas que la
 * idea no contiene.
 */
export function scenesFromIdea(idea: string, opts: { totalDuration: number; maxScenes: number; fallbackWorld: WorldId }): LocalStoryResult {
  const parts = idea
    .split(/(?<=[.;!?\n])\s+|\s*(?:\bluego\b|\bdespu[eé]s\b|\bfinalmente\b|\bal final\b|\bentonces\b|\bmás tarde\b|\bhasta que\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^\p{L}]/gu, '').length > 3)
    .slice(0, opts.maxScenes);
  const notes: string[] = [];
  if (parts.length === 0) return { scenes: [], notes: ['Describe al menos un momento (una frase) para generar escenas.'] };
  const globalWorld = detectWorld(idea) ?? opts.fallbackWorld;
  let prevWorld: WorldId | null = null;
  const duration = Math.max(3, Math.round((opts.totalDuration / parts.length) * 10) / 10);
  const scenes = parts.map((sentence, i) => {
    const world = detectWorld(sentence) ?? prevWorld ?? globalWorld;
    const interp = interpretLocally(sentence, world);
    const ops = interp.operations.filter((o) => o.op !== 'setWorld');
    const built = buildSceneParams(world, ops);
    const transition: TransitionType = i === 0 ? 'fade' : prevWorld === world ? 'morph' : 'fade';
    prevWorld = world;
    if (ops.length === 0) notes.push(`Escena ${i + 1}: sin indicaciones visuales reconocidas, se usa el preset de «${WORLDS[world].name}».`);
    return createScene(world, {
      name: titleFrom(sentence),
      description: sentence.slice(0, 600),
      duration,
      params: built.params,
      bindings: built.bindings.length ? built.bindings : undefined,
      transition: { type: transition, duration: 1.5 },
    });
  });
  return { scenes, notes };
}

/** Convierte un guion validado de IA en escenas reales del motor. */
export function scenesFromPlan(plan: StoryPlan): StoryScene[] {
  return plan.scenes.map((s) =>
    toScene({
      name: s.name,
      description: s.description,
      world: s.world,
      duration: s.duration,
      transition: s.transition,
      mood: s.mood ?? undefined,
      ops: s.operations.filter((o) => o.op !== 'setWorld'),
    }),
  );
}
