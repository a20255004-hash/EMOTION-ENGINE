/**
 * Operaciones estructuradas sobre la escena.
 *
 * Es el ÚNICO canal por el que el intérprete local, un modelo de IA o las
 * plantillas narrativas pueden modificar el estado. Ninguno de ellos ejecuta
 * código: proponen operaciones, se validan con este esquema y se aplican con
 * `applyOperations`, que recorta rangos y rechaza lo inválido con un motivo.
 */
import { z } from 'zod';
import {
  CAMERA_MODES,
  HEX_RE,
  PARAM_DEFS,
  clampParam,
  isColorParam,
  isNumericParam,
  type ParamId,
  type VisualParams,
  type WorldId,
} from './params';
import { MOODS, worldPreset, type MoodId } from './presets';
import {
  AudioSourceSchema,
  AudioTargetSchema,
  HexColorSchema,
  MoodIdSchema,
  NumericParamIdSchema,
  WorldIdSchema,
  type AudioBinding,
  type AudioSettings,
} from './schema';

const ColorParamIdSchema = z.enum(['lightColor', 'primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'particleColor']);

export const OperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('setNumber'), param: NumericParamIdSchema, value: z.number() }),
  z.object({ op: z.literal('scaleNumber'), param: NumericParamIdSchema, factor: z.number().min(0).max(10) }),
  z.object({ op: z.literal('shiftNumber'), param: NumericParamIdSchema, delta: z.number() }),
  z.object({ op: z.literal('setColor'), param: ColorParamIdSchema, value: HexColorSchema }),
  z.object({ op: z.literal('setCameraMode'), mode: z.enum(CAMERA_MODES) }),
  z.object({ op: z.literal('setWorld'), world: WorldIdSchema }),
  z.object({ op: z.literal('applyMood'), mood: MoodIdSchema, strength: z.number().min(0).max(1) }),
  z.object({
    op: z.literal('bindAudio'),
    source: AudioSourceSchema,
    target: AudioTargetSchema,
    amount: z.number().min(-1).max(1),
  }),
  z.object({ op: z.literal('unbindAudio'), target: AudioTargetSchema.nullable(), source: AudioSourceSchema.nullable() }),
  z.object({
    op: z.literal('setAudioSetting'),
    key: z.enum(['sensitivity', 'smoothing', 'intensity']),
    value: z.number(),
  }),
]);
export type Operation = z.infer<typeof OperationSchema>;

export const OperationPlanSchema = z.object({
  operations: z.array(OperationSchema).max(40),
  explanation: z.string().max(1200),
});
export type OperationPlan = z.infer<typeof OperationPlanSchema>;

export interface EditableState {
  world: WorldId;
  params: VisualParams;
  bindings: AudioBinding[];
  audioSettings: AudioSettings;
}

export interface AppliedChange {
  key: string;
  label: string;
  before: string;
  after: string;
}
export interface RejectedOperation {
  op: unknown;
  reason: string;
}
export interface ApplyResult {
  state: EditableState;
  changes: AppliedChange[];
  rejected: RejectedOperation[];
}

const AUDIO_SETTING_RANGES = { sensitivity: [0, 3], smoothing: [0, 0.95], intensity: [0, 2] } as const;

const fmt = (v: unknown) => (typeof v === 'number' ? (Math.round(v * 100) / 100).toString() : String(v));

let idCounter = 0;
export function makeId(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}${idCounter.toString(36)}`;
}

/** Mezcla dos colores hex. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const mix = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return '#' + [mix(16), mix(8), mix(0)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** Aplica el efecto de un estado de ánimo con una intensidad 0..1. */
export function moodPatch(params: VisualParams, mood: MoodId, strength: number): Partial<VisualParams> {
  const info = MOODS[mood];
  const patch: Record<string, unknown> = {};
  for (const [key, factor] of Object.entries(info.scale ?? {})) {
    if (!isNumericParam(key) || typeof factor !== 'number') continue;
    const current = params[key];
    const f = 1 + (factor - 1) * strength;
    const base = current === 0 && factor > 1 ? (PARAM_DEFS[key].max - PARAM_DEFS[key].min) * 0.1 : current;
    patch[key] = clampParam(key, base * f);
  }
  for (const [key, value] of Object.entries(info.set ?? {})) {
    if (isColorParam(key) && typeof value === 'string') patch[key] = mixHex(params[key], value, strength);
    else if (key === 'cameraMode' && strength >= 0.5) patch[key] = value;
  }
  return patch as Partial<VisualParams>;
}

export function applyOperations(input: EditableState, ops: unknown[]): ApplyResult {
  const state: EditableState = {
    world: input.world,
    params: { ...input.params },
    bindings: input.bindings.map((b) => ({ ...b })),
    audioSettings: { ...input.audioSettings },
  };
  const changes: AppliedChange[] = [];
  const rejected: RejectedOperation[] = [];

  const setParam = (id: ParamId, value: unknown) => {
    const before = state.params[id];
    if (before === value) return;
    (state.params as Record<string, unknown>)[id] = value;
    changes.push({ key: id, label: PARAM_DEFS[id].label, before: fmt(before), after: fmt(value) });
  };

  for (const raw of ops) {
    const parsed = OperationSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ op: raw, reason: parsed.error.issues.map((i) => `${i.path.join('.') || 'op'}: ${i.message}`).join('; ') });
      continue;
    }
    const op = parsed.data;
    switch (op.op) {
      case 'setNumber':
        setParam(op.param, clampParam(op.param, op.value));
        break;
      case 'scaleNumber': {
        const cur = state.params[op.param];
        const d = PARAM_DEFS[op.param];
        // Si el valor es 0, multiplicar no tendría efecto: se parte de un 10 % del rango.
        const base = cur === 0 && op.factor > 1 ? (d.max - d.min) * 0.1 : cur;
        setParam(op.param, clampParam(op.param, base * op.factor));
        break;
      }
      case 'shiftNumber':
        setParam(op.param, clampParam(op.param, state.params[op.param] + op.delta));
        break;
      case 'setColor':
        if (!HEX_RE.test(op.value)) {
          rejected.push({ op, reason: 'Color inválido' });
          break;
        }
        setParam(op.param, op.value.toLowerCase());
        break;
      case 'setCameraMode':
        setParam('cameraMode', op.mode);
        break;
      case 'setWorld': {
        if (state.world === op.world) break;
        const before = state.world;
        // Cambiar de mundo carga su identidad visual (paleta, luz, cámara) conservando la dinámica elegida.
        const preset = worldPreset(op.world);
        const keep = { speed: state.params.speed, particleDensity: state.params.particleDensity, intensity: state.params.intensity };
        state.world = op.world;
        state.params = { ...preset, ...keep };
        changes.push({ key: 'world', label: 'Mundo', before, after: op.world });
        break;
      }
      case 'applyMood': {
        const patch = moodPatch(state.params, op.mood, op.strength);
        for (const [k, v] of Object.entries(patch)) setParam(k as ParamId, v);
        break;
      }
      case 'bindAudio': {
        const existing = state.bindings.find((b) => b.source === op.source && b.target === op.target);
        if (existing) {
          const before = `${existing.source}→${existing.target} ${fmt(existing.amount)}`;
          existing.amount = op.amount;
          existing.enabled = true;
          changes.push({ key: `binding:${existing.id}`, label: 'Vinculación de audio', before, after: `${op.source}→${op.target} ${fmt(op.amount)}` });
        } else if (state.bindings.length >= 32) {
          rejected.push({ op, reason: 'Máximo de 32 vinculaciones' });
        } else {
          const b: AudioBinding = { id: makeId('bind'), source: op.source, target: op.target, amount: op.amount, enabled: true };
          state.bindings.push(b);
          changes.push({ key: `binding:${b.id}`, label: 'Vinculación de audio', before: '—', after: `${op.source}→${op.target} ${fmt(op.amount)}` });
        }
        break;
      }
      case 'unbindAudio': {
        const keep: AudioBinding[] = [];
        for (const b of state.bindings) {
          const match = (op.target === null || b.target === op.target) && (op.source === null || b.source === op.source);
          if (match) changes.push({ key: `binding:${b.id}`, label: 'Vinculación de audio', before: `${b.source}→${b.target}`, after: 'eliminada' });
          else keep.push(b);
        }
        state.bindings = keep;
        break;
      }
      case 'setAudioSetting': {
        const [min, max] = AUDIO_SETTING_RANGES[op.key];
        const before = state.audioSettings[op.key];
        const value = Math.min(max, Math.max(min, op.value));
        if (before !== value) {
          state.audioSettings[op.key] = value;
          changes.push({ key: `audio:${op.key}`, label: `Audio · ${op.key}`, before: fmt(before), after: fmt(value) });
        }
        break;
      }
    }
  }
  return { state, changes, rejected };
}
