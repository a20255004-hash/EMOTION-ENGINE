import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createProject, parseProject } from '../../shared/projectFactory';
import { IndexedDbProjectRepository } from '../../src/storage/ProjectRepository';

const repo = new IndexedDbProjectRepository();

describe('repositorio local', () => {
  it('guarda, lista y recupera', async () => {
    const p = createProject('Prueba', 'cosmos');
    p.scene.params.speed = 2.5;
    await repo.save(p);
    const got = await repo.get(p.id);
    expect(got?.scene.params.speed).toBe(2.5);
    expect((await repo.list()).some((x) => x.id === p.id)).toBe(true);
  });

  it('duplica con pistas independientes y elimina en cascada', async () => {
    const p = createProject('Con audio');
    p.audio.tracks.push({ id: 'trk_1', name: 't', mime: 'audio/wav', size: 4, duration: 1, source: 'upload', createdAt: 1 });
    await repo.save(p);
    await repo.putBlob('trk_1', new Blob(['abcd']));
    const copy = await repo.duplicate(p.id);
    expect(copy.id).not.toBe(p.id);
    expect(copy.audio.tracks[0].id).not.toBe('trk_1');
    expect(await repo.getBlob(copy.audio.tracks[0].id)).not.toBeNull();
    await repo.saveVersion(p, 'v1', false);
    await repo.remove(p.id);
    expect(await repo.get(p.id)).toBeNull();
    expect(await repo.listVersions(p.id)).toHaveLength(0);
    expect(await repo.getBlob('trk_1')).toBeNull();
    expect(await repo.getBlob(copy.audio.tracks[0].id)).not.toBeNull();
  });

  it('versiones: guarda instantáneas y poda las automáticas', async () => {
    const p = createProject('Versionado');
    await repo.save(p);
    for (let i = 0; i < 30; i++) await repo.saveVersion(p, `auto ${i}`, true);
    await repo.saveVersion(p, 'manual', false);
    const v = await repo.listVersions(p.id);
    expect(v.filter((x) => x.auto)).toHaveLength(25);
    expect(v.some((x) => x.label === 'manual')).toBe(true);
  });
});

describe('parseProject', () => {
  it('repara proyectos incompletos con valores por defecto', () => {
    const r = parseProject({ name: 'Viejo', scene: { world: 'atmosphere', params: { speed: 50, primaryColor: 'nope' } } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.scene.params.speed).toBe(3);
      expect(r.project.scene.params.primaryColor).toMatch(/^#/);
    }
  });
  it('rechaza basura', () => {
    expect(parseProject(42).ok).toBe(false);
    expect(parseProject({ scene: { world: 'marte' }, sequence: { scenes: 'x' } }).ok).toBe(false);
  });
});
