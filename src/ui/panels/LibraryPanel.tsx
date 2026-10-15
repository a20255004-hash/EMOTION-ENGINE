import { useCallback, useEffect, useRef, useState } from 'react';
import { WORLD_IDS, type WorldId } from '../../../shared/params';
import { WORLDS } from '../../../shared/presets';
import type { ProjectVersion } from '../../../shared/schema';
import { repository, type ProjectSummary } from '../../storage/ProjectRepository';
import { importProjectJson, useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { storyPlayer } from '../../story/player';
import { ConfirmDialog, IconButton, Notice, Section } from '../components/controls';
import { Icon } from '../components/Icon';
import { worldArt } from './StudioPanel';

const dateFmt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

export function LibraryPanel() {
  const current = useProjectStore((s) => s.project);
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete'; p: ProjectSummary } | { kind: 'restore'; v: ProjectVersion } | null>(null);
  const [newName, setNewName] = useState('');
  const [newWorld, setNewWorld] = useState<WorldId>('cosmos');
  const [versionLabel, setVersionLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useUiStore((s) => s.toast);

  const refresh = useCallback(async () => {
    try {
      const [l, v] = await Promise.all([repository.list(), current ? repository.listVersions(current.id) : Promise.resolve([])]);
      setList(l);
      setVersions(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la biblioteca');
    } finally {
      setLoading(false);
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refresh();
  }, [refresh, saveStatus]);

  const store = useProjectStore.getState();
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      storyPlayer.stop();
      await fn();
      if (ok) toast(ok, 'success');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };

  return (
    <div className="inspector-inner" data-testid="panel-library">
      <div className="panel-header">
        <div>
          <h2>Biblioteca</h2>
          <p>Proyectos guardados en este navegador.</p>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Nuevo proyecto</h3>
        <input className="input" placeholder="Nombre del proyecto" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} data-testid="new-project-name" aria-label="Nombre del nuevo proyecto" />
        <div className="world-grid compact" role="group" aria-label="Escenario inicial">
          {WORLD_IDS.map((w) => (
            <button key={w} type="button" className="world-card" aria-pressed={newWorld === w} onClick={() => setNewWorld(w)} title={WORLDS[w].name}>
              <span className="art" style={{ background: worldArt(w) }} />
              <span className="name">{WORLDS[w].name}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary grow" onClick={() => run(() => store.create(newName.trim() || 'Proyecto sin título', newWorld).then(() => setNewName('')), 'Proyecto creado')} data-testid="create-project">
            <Icon name="plus" /> Crear
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            data-testid="import-project-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void run(async () => store.load(await importProjectJson(await f.text())), 'Proyecto importado');
            }}
          />
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Importar .json
          </button>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      <Section title="Proyectos" badge={<span className="section-badge">{list.length}</span>}>
        {loading ? (
          <span className="hint">Cargando…</span>
        ) : (
          <div className="project-grid" data-testid="project-grid">
            {list.map((p) => (
              <div key={p.id} className="project-card" aria-current={current?.id === p.id} data-testid="project-card">
                <button
                  type="button"
                  className="thumb"
                  style={{ backgroundImage: p.thumbnail ? `url(${p.thumbnail})` : worldArt(p.world) }}
                  onClick={() => current?.id !== p.id && run(() => store.open(p.id), `Abierto «${p.name}»`)}
                  aria-label={`Abrir ${p.name}`}
                  data-testid="project-open"
                />
                <div className="info">
                  <span className="title" title={p.name}>
                    {p.name}
                  </span>
                  <span className="meta">
                    {WORLDS[p.world].name} · {p.sceneCount} esc. · {p.trackCount} pistas
                  </span>
                  <span className="meta">{dateFmt.format(p.updatedAt)}</span>
                </div>
                <div className="actions">
                  {current?.id === p.id && <span className="badge accent">Abierto</span>}
                  <span className="grow" />
                  <IconButton icon="copy" size="sm" label={`Duplicar ${p.name}`} onClick={() => run(() => repository.duplicate(p.id), 'Proyecto duplicado')} testId="project-duplicate" />
                  <IconButton icon="trash" size="sm" label={`Eliminar ${p.name}`} onClick={() => setConfirm({ kind: 'delete', p })} testId="project-delete" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {current && (
        <Section title={`Versiones de «${current.name}»`} badge={<span className="section-badge">{versions.length}</span>}>
          <div className="row">
            <input className="input grow" placeholder="Etiqueta (opcional)" value={versionLabel} maxLength={120} onChange={(e) => setVersionLabel(e.target.value)} aria-label="Etiqueta de versión" />
            <button
              type="button"
              className="btn"
              onClick={() =>
                run(async () => {
                  await store.saveVersion(versionLabel.trim() || `Versión ${versions.filter((v) => !v.auto).length + 1}`);
                  setVersionLabel('');
                }, 'Versión guardada')
              }
              data-testid="save-version"
            >
              <Icon name="save" /> Guardar versión
            </button>
          </div>
          {versions.length === 0 && <p className="hint">Sin versiones todavía. También se crean automáticamente cada pocos minutos de trabajo.</p>}
          <div className="stack" style={{ gap: 6 }} data-testid="version-list">
            {versions.map((v) => (
              <div key={v.id} className="version" data-testid="version-item">
                <Icon name={v.auto ? 'history' : 'save'} className="grow-0" />
                <div className="grow">
                  <div style={{ fontWeight: 550 }}>{v.label}</div>
                  <div className="hint">
                    {dateFmt.format(v.createdAt)} · {v.snapshot.sequence.scenes.length} escenas · {WORLDS[v.snapshot.scene.world].name}
                  </div>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => setConfirm({ kind: 'restore', v })} data-testid="version-restore">
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Notice kind="info">
        Los proyectos se guardan automáticamente en este navegador (IndexedDB) y hay una copia de recuperación ante recargas o cierres. Las cuentas y la sincronización en la nube llegarán en una fase posterior; mientras tanto,
        exporta el .json desde Export Studio para llevar un proyecto a otro equipo.
      </Notice>

      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title="¿Eliminar proyecto?"
          message={`«${confirm.p.name}» se eliminará definitivamente junto con sus versiones y pistas de audio. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar definitivamente"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const target = confirm.p;
            setConfirm(null);
            void run(async () => {
              await repository.remove(target.id);
              if (current?.id === target.id) {
                const rest = (await repository.list())[0];
                if (rest) await store.open(rest.id);
                else await store.create('Proyecto sin título', 'ocean');
              }
            }, 'Proyecto eliminado');
          }}
        />
      )}
      {confirm?.kind === 'restore' && (
        <ConfirmDialog
          title="¿Restaurar versión?"
          message={`El proyecto volverá al estado de «${confirm.v.label}». Antes se guardará automáticamente una versión del estado actual, para que puedas volver.`}
          confirmLabel="Restaurar"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const v = confirm.v;
            setConfirm(null);
            void run(async () => {
              await store.saveVersion('Antes de restaurar');
              store.commit((p) => ({ ...v.snapshot, id: p.id, name: p.name, createdAt: p.createdAt, thumbnail: p.thumbnail, sync: p.sync }));
              await store.saveNow();
            }, 'Versión restaurada');
          }}
        />
      )}
    </div>
  );
}
