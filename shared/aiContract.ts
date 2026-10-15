/**
 * Contrato entre la plataforma y cualquier modelo de IA (independiente del proveedor).
 * El modelo recibe la lista de parámetros y operaciones permitidas, y solo puede
 * devolver JSON que cumpla `OperationPlanSchema` o `StoryPlanSchema`.
 */
import { z } from 'zod';
import { OperationSchema, type OperationPlan } from './operations';
import { CAMERA_MODES, NUMERIC_PARAM_IDS, PARAM_DEFS, PARAM_IDS, AUDIO_TARGETS, type VisualParams, type WorldId } from './params';
import { MOODS, MOOD_IDS, WORLDS } from './presets';
import { AUDIO_SOURCES, MoodIdSchema, TRANSITIONS, WorldIdSchema, type AudioBinding } from './schema';

export const InterpretRequestSchema = z.object({
  instruction: z.string().min(1).max(1000),
  state: z.object({
    world: WorldIdSchema,
    params: z.record(z.string(), z.union([z.number(), z.string()])),
    bindings: z.array(z.object({ source: z.string(), target: z.string(), amount: z.number(), enabled: z.boolean() })).max(32),
  }),
});
export type InterpretRequest = z.infer<typeof InterpretRequestSchema>;

export const StoryRequestSchema = z.object({
  idea: z.string().min(3).max(4000),
  sceneCount: z.number().int().min(2).max(12),
  totalDurationSec: z.number().min(10).max(600),
  consistent: z.boolean(),
});
export type StoryRequest = z.infer<typeof StoryRequestSchema>;

export const StoryPlanSceneSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(600),
  duration: z.number().min(1).max(120),
  world: WorldIdSchema,
  mood: MoodIdSchema.nullable(),
  transition: z.enum(TRANSITIONS),
  operations: z.array(OperationSchema).max(20),
});
export const StoryPlanSchema = z.object({
  title: z.string().min(1).max(120),
  scenes: z.array(StoryPlanSceneSchema).min(1).max(12),
});
export type StoryPlan = z.infer<typeof StoryPlanSchema>;

function paramTable(): string {
  return PARAM_IDS.map((id) => {
    const d = PARAM_DEFS[id];
    if (d.kind === 'number') return `- ${id} (número ${d.min}..${d.max}, defecto ${d.default}): ${d.description}`;
    if (d.kind === 'color') return `- ${id} (color #rrggbb): ${d.description}`;
    return `- ${id} (uno de ${d.options.map((o) => o.value).join('|')}): ${d.description}`;
  }).join('\n');
}

export function buildSystemPrompt(): string {
  return `Eres el intérprete de instrucciones de EMOTION ENGINE, un estudio audiovisual generativo en tiempo real.
Tu única salida es un plan de operaciones JSON. No escribes código, no inventas parámetros y no describes acciones que no puedas expresar como operaciones.

Mundos disponibles: ${Object.values(WORLDS).map((w) => `${w.id} (${w.name})`).join(', ')}.
Estados de ánimo: ${MOOD_IDS.map((m) => `${m} (${MOODS[m].label})`).join(', ')}.
Modos de cámara: ${CAMERA_MODES.join(', ')}.
Fuentes de audio: ${AUDIO_SOURCES.join(', ')} (bass=graves, lowMid=medios-graves, mid=medios, high=agudos, volume=volumen, beat=pulso rítmico).
Destinos de audio permitidos: ${AUDIO_TARGETS.join(', ')}.

Parámetros visuales:
${paramTable()}

Operaciones permitidas (campo "op"):
- setNumber {param, value}: valor absoluto dentro del rango.
- scaleNumber {param, factor}: multiplica (0.5 = la mitad, 1.5 = +50 %).
- shiftNumber {param, delta}: suma en unidades del parámetro.
- setColor {param, value}: param ∈ lightColor, primaryColor, secondaryColor, accentColor, backgroundColor, particleColor.
- setCameraMode {mode}
- setWorld {world}: solo si el usuario pide otro entorno explícitamente.
- applyMood {mood, strength 0..1}
- bindAudio {source, target, amount -1..1}: vincula una banda a un parámetro (0.3–0.6 es una reacción clara).
- unbindAudio {target|null, source|null}
- setAudioSetting {key: sensitivity|smoothing|intensity, value}

Reglas:
1. Prefiere cambios relativos (scaleNumber) para "más/menos"; usa setNumber solo para valores concretos.
2. Mantén el plan mínimo: solo lo que la instrucción pide o implica claramente.
3. Si algo de la instrucción no puede expresarse con estas operaciones, dilo en "explanation" y no lo inventes.
4. "explanation" va en el idioma del usuario, breve, y describe qué cambia.`;
}

export function describeState(world: WorldId, params: VisualParams | Record<string, number | string>, bindings: Pick<AudioBinding, 'source' | 'target' | 'amount' | 'enabled'>[]): string {
  const p = params as Record<string, number | string>;
  const numeric = NUMERIC_PARAM_IDS.map((id) => `${id}=${typeof p[id] === 'number' ? Math.round((p[id] as number) * 100) / 100 : p[id]}`).join(', ');
  const colors = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'lightColor', 'particleColor'].map((id) => `${id}=${p[id]}`).join(', ');
  const b = bindings.length ? bindings.map((x) => `${x.source}→${x.target} (${x.amount}${x.enabled ? '' : ', desactivada'})`).join('; ') : 'ninguna';
  return `Mundo actual: ${world}. Cámara: ${p.cameraMode}.\nNuméricos: ${numeric}.\nColores: ${colors}.\nVinculaciones de audio: ${b}.`;
}

export function buildStorySystemPrompt(): string {
  return `${buildSystemPrompt()}

Además, puedes recibir una idea narrativa. En ese caso devuelves un guion de escenas JSON:
- title: título breve.
- scenes: lista de escenas con name, description (1–2 frases evocadoras), duration (segundos), world, mood (o null), transition (${TRANSITIONS.join('|')}) y operations (ajustes sobre el preset del mundo + mood).
Si se pide consistencia, mantén la misma paleta entre escenas (sin setColor divergentes) y usa transiciones morph cuando el mundo no cambia.`;
}

export type { OperationPlan };
