/**
 * Esquemas tipados y validados (zod) de todo lo que se guarda o viaja por red.
 * Los usan el cliente (persistencia, importación) y el servidor (validar la
 * salida de modelos de IA antes de devolverla).
 */
import { z } from 'zod';
import {
  AUDIO_TARGETS,
  CAMERA_MODES,
  COLOR_PARAM_IDS,
  HEX_RE,
  NUMERIC_PARAM_IDS,
  PARAM_DEFS,
  WORLD_IDS,
  defaultParams,
  type NumericParamId,
  type VisualParams,
} from './params';
import { MOOD_IDS } from './presets';

export const SCHEMA_VERSION = 1;

export const WorldIdSchema = z.enum(WORLD_IDS);
export const HexColorSchema = z.string().regex(HEX_RE, 'Color hexadecimal #rrggbb');
export const NumericParamIdSchema = z.enum(NUMERIC_PARAM_IDS as [NumericParamId, ...NumericParamId[]]);
export const AudioTargetSchema = z.enum(AUDIO_TARGETS as [NumericParamId, ...NumericParamId[]]);
export const MoodIdSchema = z.enum(MOOD_IDS);

/** Parámetros visuales: cada número se recorta a su rango; lo ausente toma su valor por defecto. */
export const VisualParamsSchema: z.ZodType<VisualParams> = z
  .record(z.string(), z.unknown())
  .transform((raw) => {
    const out = defaultParams() as Record<string, unknown>;
    for (const id of NUMERIC_PARAM_IDS) {
      const v = raw[id];
      if (typeof v === 'number' && Number.isFinite(v)) {
        const d = PARAM_DEFS[id];
        out[id] = Math.min(d.max, Math.max(d.min, v));
      }
    }
    for (const id of COLOR_PARAM_IDS) {
      const v = raw[id];
      if (typeof v === 'string' && HEX_RE.test(v)) out[id] = v.toLowerCase();
    }
    if (typeof raw.cameraMode === 'string' && (CAMERA_MODES as readonly string[]).includes(raw.cameraMode)) {
      out.cameraMode = raw.cameraMode;
    }
    return out as VisualParams;
  }) as unknown as z.ZodType<VisualParams>;

export const SceneStateSchema = z.object({
  world: WorldIdSchema,
  params: VisualParamsSchema,
});
export type SceneState = z.infer<typeof SceneStateSchema>;

// ---------- Audio ----------
export const AUDIO_SOURCES = ['bass', 'lowMid', 'mid', 'high', 'volume', 'beat'] as const;
export type AudioSource = (typeof AUDIO_SOURCES)[number];
export const AudioSourceSchema = z.enum(AUDIO_SOURCES);

export const AudioBindingSchema = z.object({
  id: z.string().min(1),
  source: AudioSourceSchema,
  target: AudioTargetSchema,
  /** -1..1: fracción del rango del parámetro que se suma con la señal al máximo. */
  amount: z.number().min(-1).max(1),
  enabled: z.boolean(),
});
export type AudioBinding = z.infer<typeof AudioBindingSchema>;

export const AudioSettingsSchema = z.object({
  sensitivity: z.number().min(0).max(3).default(1),
  smoothing: z.number().min(0).max(0.95).default(0.6),
  intensity: z.number().min(0).max(2).default(1),
  attack: z.number().min(0).max(1).default(0.6),
  release: z.number().min(0).max(1).default(0.25),
  bindingsEnabled: z.boolean().default(true),
  volume: z.number().min(0).max(1).default(0.8),
  loop: z.boolean().default(true),
  /** Paisaje sonoro generativo de cada escenario. */
  ambienceEnabled: z.boolean().default(true),
  ambienceVolume: z.number().min(0).max(1).default(0.6),
});
export type AudioSettings = z.infer<typeof AudioSettingsSchema>;

export const TrackRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  mime: z.string().max(100),
  size: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  source: z.enum(['upload', 'demo', 'generated']),
  /** Proveedor que la generó, si procede (p. ej. "mock", "http"). */
  provider: z.string().max(60).optional(),
  createdAt: z.number(),
});
export type TrackRef = z.infer<typeof TrackRefSchema>;

export const ProjectAudioSchema = z.object({
  settings: AudioSettingsSchema,
  bindings: z.array(AudioBindingSchema).max(32),
  activeTrackId: z.string().nullable(),
  tracks: z.array(TrackRefSchema).max(64),
});
export type ProjectAudio = z.infer<typeof ProjectAudioSchema>;

// ---------- Story ----------
export const TRANSITIONS = ['cut', 'fade', 'morph', 'flash'] as const;
export type TransitionType = (typeof TRANSITIONS)[number];

export const StorySceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().max(600),
  duration: z.number().min(1).max(120),
  world: WorldIdSchema,
  params: VisualParamsSchema,
  bindings: z.array(AudioBindingSchema).max(32).optional(),
  audio: z.object({
    trackId: z.string().nullable(),
    volume: z.number().min(0).max(1),
  }),
  transition: z.object({
    type: z.enum(TRANSITIONS),
    duration: z.number().min(0).max(10),
  }),
});
export type StoryScene = z.infer<typeof StorySceneSchema>;

export const CONSISTENCY_LOCKS = ['palette', 'lighting', 'particles', 'post', 'world'] as const;
export type ConsistencyLock = (typeof CONSISTENCY_LOCKS)[number];

export const SequenceSchema = z.object({
  title: z.string().max(120),
  idea: z.string().max(4000),
  scenes: z.array(StorySceneSchema).max(60),
  loop: z.boolean(),
  consistency: z.object({
    enabled: z.boolean(),
    locks: z.array(z.enum(CONSISTENCY_LOCKS)),
  }),
});
export type Sequence = z.infer<typeof SequenceSchema>;

// ---------- Export ----------
export const ExportSettingsSchema = z.object({
  image: z.object({
    format: z.enum(['png', 'jpeg', 'webp']),
    scale: z.number().min(0.5).max(4),
    quality: z.number().min(0.5).max(1),
  }),
  video: z.object({
    resolution: z.enum(['viewport', '720p', '1080p', 'square', 'vertical']),
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
    bitrateMbps: z.number().min(1).max(40),
    includeAudio: z.boolean(),
    durationSec: z.number().min(1).max(600),
    source: z.enum(['live', 'sequence']),
  }),
});
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;

// ---------- Project ----------
export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  createdAt: z.number(),
  updatedAt: z.number(),
  scene: SceneStateSchema,
  audio: ProjectAudioSchema,
  sequence: SequenceSchema,
  exportSettings: ExportSettingsSchema,
  /** Miniatura JPEG pequeña (data URL) para la biblioteca. */
  thumbnail: z.string().max(400_000).nullable(),
  /** Reservado para cuentas y sincronización remota. */
  sync: z.object({
    ownerId: z.string().nullable(),
    remoteId: z.string().nullable(),
    revision: z.number().int().nonnegative(),
    state: z.enum(['local', 'synced', 'pending', 'conflict']),
  }),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectVersionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.number(),
  label: z.string().max(120),
  auto: z.boolean(),
  snapshot: ProjectSchema,
});
export type ProjectVersion = z.infer<typeof ProjectVersionSchema>;

export function defaultAudioSettings(): AudioSettings {
  return AudioSettingsSchema.parse({});
}

export function defaultExportSettings(): ExportSettings {
  return {
    image: { format: 'png', scale: 2, quality: 0.92 },
    video: { resolution: '720p', fps: 30, bitrateMbps: 8, includeAudio: true, durationSec: 10, source: 'live' },
  };
}
