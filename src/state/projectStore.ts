import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { applyOperations, makeId, type ApplyResult } from '../../shared/operations';
import { createProject, createScene, parseProject } from '../../shared/projectFactory';
import { PARAM_DEFS, clampParam, isNumericParam, type ParamId, type VisualParams, type WorldId } from '../../shared/params';
import { worldPreset } from '../../shared/presets';
import type { AudioBinding, AudioSettings, ExportSettings, Project, Sequence, StoryScene, TrackRef } from '../../shared/schema';
import { repository } from '../storage/ProjectRepository';
import { clearRecovery, getLastProjectId, readRecovery, setLastProjectId, writeRecovery } from '../storage/recovery';
import { applyConsistency } from '../story/sequence';

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

interface CommitOptions {
  /** Agrupa cambios rápidos (p. ej. arrastrar un deslizador) en un solo paso de deshacer. */
  coalesceKey?: string;
  history?: boolean;
}

interface ProjectState {
  project: Project | null;
  ready: boolean;
  bootError: string | null;
  recoveredNotice: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: number | null;
  past: Project[];
  future: Project[];
  lastCoalesce: { key: string; at: number } | null;

  init(): Promise<void>;
  __boot(): Promise<void>;
  open(id: string): Promise<void>;
  create(name?: string, world?: WorldId): Promise<Project>;
  load(project: Project): Promise<void>;
  saveNow(): Promise<void>;
  saveVersion(label: string): Promise<void>;
  dismissRecovered(): void;

  commit(mutate: (p: Project) => Project, opts?: CommitOptions): void;
  undo(): void;
  redo(): void;

  rename(name: string): void;
  setParam(id: ParamId, value: number | string): void;
  setParams(patch: Partial<VisualParams>, coalesceKey?: string): void;
  setWorld(world: WorldId): void;
  resetParams(): void;
  applyOps(ops: unknown[]): ApplyResult | null;

  addTrack(ref: TrackRef, blob: Blob): Promise<void>;
  removeTrack(id: string): Promise<void>;
  setActiveTrack(id: string | null): void;
  updateAudioSettings(patch: Partial<AudioSettings>, coalesceKey?: string): void;
  addBinding(b?: Partial<AudioBinding>): void;
  updateBinding(id: string, patch: Partial<AudioBinding>, coalesceKey?: string): void;
  removeBinding(id: string): void;

  updateSequence(patch: Partial<Sequence>): void;
  addScene(scene?: StoryScene, index?: number): void;
  updateScene(id: string, patch: Partial<StoryScene>, coalesceKey?: string): void;
  removeScene(id: string): void;
  duplicateScene(id: string): void;
  moveScene(from: number, to: number): void;
  replaceScenes(scenes: StoryScene[]): void;

  updateExportSettings(patch: { image?: Partial<ExportSettings['image']>; video?: Partial<ExportSettings['video']> }): void;
  setThumbnail(dataUrl: string): void;
}

const HISTORY_LIMIT = 80;
const AUTOSAVE_MS = 700;
const AUTO_VERSION_MS = 4 * 60 * 1000;

const withConsistency = (p: Project): Project =>
  p.sequence.consistency.enabled ? { ...p, sequence: { ...p.sequence, scenes: applyConsistency(p.sequence.scenes, p.sequence.consistency.locks) } } : p;

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set, get) => ({
    project: null,
    ready: false,
    bootError: null,
    recoveredNotice: null,
    saveStatus: 'idle',
    saveError: null,
    lastSavedAt: null,
    past: [],
    future: [],
    lastCoalesce: null,

    init() {
      // Idempotente: StrictMode y recargas en caliente pueden llamarlo dos veces.
      initPromise ??= get().__boot();
      return initPromise;
    },

    async __boot() {
      try {
        let project: Project | null = null;
        let notice: string | null = null;
        // Si la copia de recuperación es más reciente que lo guardado, se restauran esos cambios.
        const recovered = readRecovery();
        if (recovered) {
          const stored = await repository.get(recovered.id).catch(() => null);
          if (!stored || recovered.updatedAt > stored.updatedAt) {
            project = { ...recovered, thumbnail: stored?.thumbnail ?? null };
            notice = 'Se recuperaron cambios que no se habían guardado antes de cerrar o recargar.';
            await repository.save(project);
          }
        }
        const lastId = getLastProjectId();
        if (!project && lastId) project = await repository.get(lastId).catch(() => null);
        if (!project) {
          const list = await repository.list();
          if (list[0]) project = await repository.get(list[0].id);
        }
        if (!project) {
          project = createProject('Mi primera experiencia', 'ocean');
          await repository.save(project);
        }
        setLastProjectId(project.id);
        set({ project, ready: true, recoveredNotice: notice, saveStatus: 'saved', lastSavedAt: project.updatedAt, past: [], future: [] });
      } catch (e) {
        // Sin IndexedDB (modo privado estricto, cuota): se trabaja en memoria y se avisa.
        const project = readRecovery() ?? createProject('Mi primera experiencia', 'ocean');
        set({
          project,
          ready: true,
          bootError: `El almacenamiento local no está disponible (${e instanceof Error ? e.message : 'error desconocido'}). Puedes trabajar, pero exporta el proyecto (.json) para no perderlo.`,
          saveStatus: 'error',
        });
      }
    },

    async open(id) {
      await get().saveNow();
      const project = await repository.get(id);
      if (!project) throw new Error('Proyecto no encontrado');
      await get().load(project);
    },

    async create(name = 'Proyecto sin título', world = 'ocean') {
      await get().saveNow();
      const project = createProject(name, world);
      await repository.save(project);
      await get().load(project);
      return project;
    },

    async load(project) {
      setLastProjectId(project.id);
      clearRecovery();
      set({ project, past: [], future: [], saveStatus: 'saved', lastSavedAt: project.updatedAt, saveError: null, lastCoalesce: null });
    },

    async saveNow() {
      const p = get().project;
      if (!p || get().saveStatus === 'saved' || get().bootError) return;
      clearTimeout(autosaveTimer);
      set({ saveStatus: 'saving' });
      try {
        await repository.save(p);
        if (get().project?.updatedAt === p.updatedAt) set({ saveStatus: 'saved', lastSavedAt: Date.now(), saveError: null });
        if (Date.now() - lastAutoVersion > AUTO_VERSION_MS) {
          lastAutoVersion = Date.now();
          await repository.saveVersion(p, 'Guardado automático', true);
        }
      } catch (e) {
        set({ saveStatus: 'error', saveError: e instanceof Error ? e.message : 'Error al guardar' });
      }
    },

    async saveVersion(label) {
      await get().saveNow();
      const p = get().project;
      if (!p) return;
      await repository.saveVersion(p, label || 'Versión manual', false);
    },

    dismissRecovered() {
      set({ recoveredNotice: null });
    },

    commit(mutate, opts = {}) {
      const { project, past, lastCoalesce } = get();
      if (!project) return;
      const next = { ...mutate(project), updatedAt: Date.now() };
      const now = Date.now();
      const coalesce = opts.coalesceKey && lastCoalesce && lastCoalesce.key === opts.coalesceKey && now - lastCoalesce.at < 1200;
      const pushHistory = opts.history !== false && !coalesce;
      set({
        project: next,
        past: pushHistory ? [...past.slice(-HISTORY_LIMIT + 1), project] : past,
        future: opts.history === false ? get().future : [],
        saveStatus: 'unsaved',
        lastCoalesce: opts.coalesceKey ? { key: opts.coalesceKey, at: now } : null,
      });
    },

    undo() {
      const { past, project, future } = get();
      if (!project || past.length === 0) return;
      const prev = past[past.length - 1];
      set({ project: { ...prev, updatedAt: Date.now() }, past: past.slice(0, -1), future: [project, ...future], saveStatus: 'unsaved', lastCoalesce: null });
    },

    redo() {
      const { past, project, future } = get();
      if (!project || future.length === 0) return;
      const next = future[0];
      set({ project: { ...next, updatedAt: Date.now() }, past: [...past, project], future: future.slice(1), saveStatus: 'unsaved', lastCoalesce: null });
    },

    rename(name) {
      const clean = name.trim().slice(0, 120);
      if (!clean) return;
      get().commit((p) => ({ ...p, name: clean }));
    },

    setParam(id, value) {
      const def = PARAM_DEFS[id];
      let v: number | string = value;
      if (isNumericParam(id)) v = clampParam(id, Number(value));
      else if (def.kind === 'color' && !/^#[0-9a-f]{6}$/i.test(String(value))) return;
      else if (def.kind === 'enum' && !def.options.some((o) => o.value === value)) return;
      get().commit((p) => ({ ...p, scene: { ...p.scene, params: { ...p.scene.params, [id]: v } } }), { coalesceKey: `param:${id}` });
    },

    setParams(patch, coalesceKey) {
      get().commit((p) => ({ ...p, scene: { ...p.scene, params: { ...p.scene.params, ...patch } } }), { coalesceKey });
    },

    setWorld(world) {
      get().applyOps([{ op: 'setWorld', world }]);
    },

    resetParams() {
      get().commit((p) => ({ ...p, scene: { ...p.scene, params: worldPreset(p.scene.world) } }));
    },

    applyOps(ops) {
      const p = get().project;
      if (!p) return null;
      const result = applyOperations({ world: p.scene.world, params: p.scene.params, bindings: p.audio.bindings, audioSettings: p.audio.settings }, ops);
      if (result.changes.length) {
        get().commit((proj) => ({
          ...proj,
          scene: { world: result.state.world, params: result.state.params },
          audio: { ...proj.audio, bindings: result.state.bindings, settings: result.state.audioSettings },
        }));
      }
      return result;
    },

    async addTrack(ref, blob) {
      await repository.putBlob(ref.id, blob);
      get().commit((p) => ({ ...p, audio: { ...p.audio, tracks: [...p.audio.tracks, ref], activeTrackId: ref.id } }));
      await get().saveNow();
    },

    async removeTrack(id) {
      get().commit((p) => ({
        ...p,
        audio: { ...p.audio, tracks: p.audio.tracks.filter((t) => t.id !== id), activeTrackId: p.audio.activeTrackId === id ? null : p.audio.activeTrackId },
        sequence: { ...p.sequence, scenes: p.sequence.scenes.map((s) => (s.audio.trackId === id ? { ...s, audio: { ...s.audio, trackId: null } } : s)) },
      }));
      await get().saveNow();
      // El archivo se conserva si alguna versión anterior lo referencia; se elimina al borrar el proyecto.
    },

    setActiveTrack(id) {
      get().commit((p) => ({ ...p, audio: { ...p.audio, activeTrackId: id } }), { history: false });
    },

    updateAudioSettings(patch, coalesceKey) {
      get().commit((p) => ({ ...p, audio: { ...p.audio, settings: { ...p.audio.settings, ...patch } } }), { coalesceKey });
    },

    addBinding(b = {}) {
      const p = get().project;
      if (!p || p.audio.bindings.length >= 32) return;
      const binding: AudioBinding = { id: makeId('bind'), source: 'bass', target: 'scale', amount: 0.35, enabled: true, ...b };
      get().commit((proj) => ({ ...proj, audio: { ...proj.audio, bindings: [...proj.audio.bindings, binding] } }));
    },

    updateBinding(id, patch, coalesceKey) {
      get().commit((p) => ({ ...p, audio: { ...p.audio, bindings: p.audio.bindings.map((b) => (b.id === id ? { ...b, ...patch } : b)) } }), { coalesceKey });
    },

    removeBinding(id) {
      get().commit((p) => ({ ...p, audio: { ...p.audio, bindings: p.audio.bindings.filter((b) => b.id !== id) } }));
    },

    updateSequence(patch) {
      get().commit((p) => withConsistency({ ...p, sequence: { ...p.sequence, ...patch } }));
    },

    addScene(scene, index) {
      get().commit((p) => {
        const s = scene ?? createScene(p.scene.world, { params: { ...p.scene.params }, name: `Escena ${p.sequence.scenes.length + 1}`, bindings: p.audio.bindings.length ? p.audio.bindings : undefined });
        const scenes = [...p.sequence.scenes];
        scenes.splice(index ?? scenes.length, 0, s);
        return withConsistency({ ...p, sequence: { ...p.sequence, scenes } });
      });
    },

    updateScene(id, patch, coalesceKey) {
      get().commit((p) => withConsistency({ ...p, sequence: { ...p.sequence, scenes: p.sequence.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) } }), { coalesceKey });
    },

    removeScene(id) {
      get().commit((p) => withConsistency({ ...p, sequence: { ...p.sequence, scenes: p.sequence.scenes.filter((s) => s.id !== id) } }));
    },

    duplicateScene(id) {
      get().commit((p) => {
        const i = p.sequence.scenes.findIndex((s) => s.id === id);
        if (i < 0) return p;
        const src = p.sequence.scenes[i];
        const copy: StoryScene = { ...structuredClone(src), id: makeId('scn'), name: `${src.name} (copia)`.slice(0, 80) };
        const scenes = [...p.sequence.scenes];
        scenes.splice(i + 1, 0, copy);
        return withConsistency({ ...p, sequence: { ...p.sequence, scenes } });
      });
    },

    moveScene(from, to) {
      get().commit((p) => {
        const scenes = [...p.sequence.scenes];
        if (from < 0 || from >= scenes.length || to < 0 || to >= scenes.length || from === to) return p;
        const [s] = scenes.splice(from, 1);
        scenes.splice(to, 0, s);
        return withConsistency({ ...p, sequence: { ...p.sequence, scenes } });
      });
    },

    replaceScenes(scenes) {
      get().commit((p) => withConsistency({ ...p, sequence: { ...p.sequence, scenes } }));
    },

    updateExportSettings(patch) {
      get().commit(
        (p) => ({
          ...p,
          exportSettings: { image: { ...p.exportSettings.image, ...patch.image }, video: { ...p.exportSettings.video, ...patch.video } },
        }),
        { history: false },
      );
    },

    setThumbnail(dataUrl) {
      if (!dataUrl) return;
      get().commit((p) => ({ ...p, thumbnail: dataUrl }), { history: false });
    },
  })),
);

let initPromise: Promise<void> | null = null;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
let lastAutoVersion = Date.now();

// Autoguardado con rebote + copia de recuperación síncrona.
useProjectStore.subscribe(
  (s) => s.project,
  (project, prev) => {
    if (!project || !prev || project === prev) return;
    if (project.id !== prev.id) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => writeRecovery(project), 250);
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => void useProjectStore.getState().saveNow(), AUTOSAVE_MS);
  },
);

if (typeof window !== 'undefined') {
  // Al cerrar o recargar: copia síncrona de recuperación (sin diálogos que bloqueen) e intento de guardado.
  const flush = () => {
    const { project, saveStatus } = useProjectStore.getState();
    if (project && saveStatus !== 'saved') {
      writeRecovery(project);
      void useProjectStore.getState().saveNow();
    }
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

/** Importa un proyecto desde JSON con identificadores nuevos. */
export async function importProjectJson(text: string): Promise<Project> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es JSON válido.');
  }
  const payload = (raw as { project?: unknown })?.project ?? raw;
  const r = parseProject(payload);
  if (!r.ok) throw new Error(r.error);
  const now = Date.now();
  const project: Project = {
    ...r.project,
    id: makeId('prj'),
    createdAt: now,
    updatedAt: now,
    // Las pistas no viajan en el JSON: se conservan las referencias pero sin archivo.
    audio: { ...r.project.audio, tracks: [], activeTrackId: null },
    sequence: { ...r.project.sequence, scenes: r.project.sequence.scenes.map((s) => ({ ...s, audio: { ...s.audio, trackId: null } })) },
    sync: { ownerId: null, remoteId: null, revision: 0, state: 'local' },
  };
  await repository.save(project);
  return project;
}
