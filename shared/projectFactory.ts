import { makeId } from './operations';
import type { WorldId } from './params';
import { WORLDS, worldPreset } from './presets';
import {
  ProjectSchema,
  SCHEMA_VERSION,
  defaultAudioSettings,
  defaultExportSettings,
  type Project,
  type StoryScene,
} from './schema';

export function createProject(name = 'Proyecto sin título', world: WorldId = 'ocean'): Project {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    scene: { world, params: worldPreset(world) },
    audio: { settings: defaultAudioSettings(), bindings: [], activeTrackId: null, tracks: [] },
    sequence: { title: '', idea: '', scenes: [], loop: false, consistency: { enabled: false, locks: ['palette'] } },
    exportSettings: defaultExportSettings(),
    thumbnail: null,
    sync: { ownerId: null, remoteId: null, revision: 0, state: 'local' },
  };
}

export function createScene(world: WorldId, overrides: Partial<StoryScene> = {}): StoryScene {
  return {
    id: makeId('scn'),
    name: WORLDS[world].name,
    description: '',
    duration: 8,
    world,
    params: worldPreset(world),
    audio: { trackId: null, volume: 1 },
    transition: { type: 'fade', duration: 1.2 },
    ...overrides,
  };
}

export type ProjectParseResult = { ok: true; project: Project } | { ok: false; error: string };

/**
 * Valida y normaliza un proyecto procedente de almacenamiento o de un archivo
 * importado. Rellena con valores por defecto lo que falte (versiones antiguas)
 * y rechaza lo que no pueda repararse.
 */
export function parseProject(raw: unknown): ProjectParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'El archivo no contiene un proyecto.' };
  const r = raw as Record<string, unknown>;
  const world = (typeof (r.scene as { world?: unknown })?.world === 'string' ? (r.scene as { world: WorldId }).world : 'ocean') as WorldId;
  const base = createProject(typeof r.name === 'string' && r.name ? r.name : 'Proyecto importado', WORLDS[world] ? world : 'ocean');
  const merged = {
    ...base,
    ...r,
    schemaVersion: SCHEMA_VERSION,
    audio: { ...base.audio, ...(r.audio as object), settings: { ...base.audio.settings, ...((r.audio as { settings?: object })?.settings ?? {}) } },
    sequence: { ...base.sequence, ...(r.sequence as object) },
    exportSettings: {
      image: { ...base.exportSettings.image, ...((r.exportSettings as { image?: object })?.image ?? {}) },
      video: { ...base.exportSettings.video, ...((r.exportSettings as { video?: object })?.video ?? {}) },
    },
    sync: { ...base.sync, ...(r.sync as object) },
    thumbnail: typeof r.thumbnail === 'string' ? r.thumbnail : null,
  };
  const parsed = ProjectSchema.safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Proyecto no válido (${issue.path.join('.')}: ${issue.message}).` };
  }
  return { ok: true, project: parsed.data };
}
