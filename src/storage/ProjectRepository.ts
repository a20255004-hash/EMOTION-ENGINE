import { makeId } from '../../shared/operations';
import { parseProject } from '../../shared/projectFactory';
import type { Project, ProjectVersion } from '../../shared/schema';
import { STORES, idb, tx } from './db';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  world: Project['scene']['world'];
  thumbnail: string | null;
  sceneCount: number;
  trackCount: number;
}

/**
 * Contrato de persistencia. La implementación del MVP es local (IndexedDB);
 * una implementación remota (cuentas + sincronización) puede cumplir la misma
 * interfaz usando `project.sync` (ownerId, remoteId, revision) para resolver
 * conflictos, sin cambiar la interfaz de usuario.
 */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  remove(id: string): Promise<void>;
  duplicate(id: string, name?: string): Promise<Project>;
  listVersions(projectId: string): Promise<ProjectVersion[]>;
  saveVersion(project: Project, label: string, auto: boolean): Promise<ProjectVersion>;
  getBlob(id: string): Promise<Blob | null>;
  putBlob(id: string, blob: Blob): Promise<void>;
  deleteBlob(id: string): Promise<void>;
}

interface BlobRecord {
  id: string;
  blob: Blob;
  createdAt: number;
}

const MAX_AUTO_VERSIONS = 25;

export class IndexedDbProjectRepository implements ProjectRepository {
  async list(): Promise<ProjectSummary[]> {
    const all = await tx([STORES.projects], 'readonly', (t) => idb.getAll<Project>(t, STORES.projects));
    return all
      .map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        world: p.scene.world,
        thumbnail: p.thumbnail,
        sceneCount: p.sequence?.scenes?.length ?? 0,
        trackCount: p.audio?.tracks?.length ?? 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Project | null> {
    const raw = await tx([STORES.projects], 'readonly', (t) => idb.get<unknown>(t, STORES.projects, id));
    if (!raw) return null;
    const r = parseProject(raw);
    if (!r.ok) throw new Error(r.error);
    return r.project;
  }

  async save(project: Project): Promise<void> {
    await tx([STORES.projects], 'readwrite', (t) => idb.put(t, STORES.projects, project));
  }

  async remove(id: string): Promise<void> {
    const project = await this.get(id).catch(() => null);
    await tx([STORES.projects, STORES.versions, STORES.blobs], 'readwrite', async (t) => {
      const versions = await idb.getAllByIndex<ProjectVersion>(t, STORES.versions, 'projectId', id);
      for (const v of versions) await idb.delete(t, STORES.versions, v.id);
      for (const track of project?.audio.tracks ?? []) await idb.delete(t, STORES.blobs, track.id);
      await idb.delete(t, STORES.projects, id);
    });
  }

  async duplicate(id: string, name?: string): Promise<Project> {
    const src = await this.get(id);
    if (!src) throw new Error('Proyecto no encontrado');
    const now = Date.now();
    // Las pistas se copian con nuevos identificadores para que borrar uno no afecte al otro.
    const idMap = new Map<string, string>();
    for (const tr of src.audio.tracks) idMap.set(tr.id, makeId('trk'));
    const copy: Project = {
      ...structuredClone(src),
      id: makeId('prj'),
      name: name ?? `${src.name} (copia)`,
      createdAt: now,
      updatedAt: now,
      sync: { ownerId: null, remoteId: null, revision: 0, state: 'local' },
    };
    copy.audio.tracks = copy.audio.tracks.map((t) => ({ ...t, id: idMap.get(t.id)! }));
    copy.audio.activeTrackId = src.audio.activeTrackId ? idMap.get(src.audio.activeTrackId) ?? null : null;
    copy.sequence.scenes = copy.sequence.scenes.map((s) => ({ ...s, audio: { ...s.audio, trackId: s.audio.trackId ? idMap.get(s.audio.trackId) ?? null : null } }));
    for (const [oldId, newId] of idMap) {
      const blob = await this.getBlob(oldId);
      if (blob) await this.putBlob(newId, blob);
    }
    await this.save(copy);
    return copy;
  }

  async listVersions(projectId: string): Promise<ProjectVersion[]> {
    const all = await tx([STORES.versions], 'readonly', (t) => idb.getAllByIndex<ProjectVersion>(t, STORES.versions, 'projectId', projectId));
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async saveVersion(project: Project, label: string, auto: boolean): Promise<ProjectVersion> {
    const version: ProjectVersion = {
      id: makeId('ver'),
      projectId: project.id,
      createdAt: Date.now(),
      label,
      auto,
      snapshot: { ...structuredClone(project), thumbnail: project.thumbnail },
    };
    await tx([STORES.versions], 'readwrite', async (t) => {
      await idb.put(t, STORES.versions, version);
      if (auto) {
        const all = await idb.getAllByIndex<ProjectVersion>(t, STORES.versions, 'projectId', project.id);
        const autos = all.filter((v) => v.auto).sort((a, b) => b.createdAt - a.createdAt);
        for (const old of autos.slice(MAX_AUTO_VERSIONS)) await idb.delete(t, STORES.versions, old.id);
      }
    });
    return version;
  }

  async getBlob(id: string): Promise<Blob | null> {
    const rec = await tx([STORES.blobs], 'readonly', (t) => idb.get<BlobRecord>(t, STORES.blobs, id));
    return rec?.blob ?? null;
  }

  async putBlob(id: string, blob: Blob): Promise<void> {
    await tx([STORES.blobs], 'readwrite', (t) => idb.put(t, STORES.blobs, { id, blob, createdAt: Date.now() } satisfies BlobRecord));
  }

  async deleteBlob(id: string): Promise<void> {
    await tx([STORES.blobs], 'readwrite', (t) => idb.delete(t, STORES.blobs, id));
  }
}

export const repository: ProjectRepository = new IndexedDbProjectRepository();
