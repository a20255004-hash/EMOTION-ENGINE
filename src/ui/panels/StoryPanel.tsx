import { useEffect, useState } from 'react';
import { WORLD_IDS, type WorldId } from '../../../shared/params';
import { WORLDS, worldPreset } from '../../../shared/presets';
import { CONSISTENCY_LOCKS, TRANSITIONS, type ConsistencyLock, type StoryScene, type TransitionType } from '../../../shared/schema';
import { formatTime } from '../../export/files';
import { ApiError, storyWithAi } from '../../integrations/apiClient';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { storyPlayer } from '../../story/player';
import { sceneStartTimes, totalDuration } from '../../story/sequence';
import { STORY_TEMPLATES, scenesFromIdea, scenesFromPlan, scenesFromTemplate } from '../../story/templates';
import { ConfirmDialog, IconButton, Notice, Section, Select, Slider, Toggle } from '../components/controls';
import { Icon } from '../components/Icon';
import { worldArt } from './StudioPanel';

const TRANSITION_LABEL: Record<TransitionType, string> = { cut: 'Corte', fade: 'Fundido a negro', morph: 'Morph (interpola)', flash: 'Destello blanco' };
const LOCK_LABEL: Record<ConsistencyLock, string> = { palette: 'Paleta', lighting: 'Iluminación', particles: 'Partículas', post: 'Intensidad visual', world: 'Mundo' };

export function StoryTimeline() {
  const scenes = useProjectStore((s) => s.project?.sequence.scenes ?? []);
  const loop = useProjectStore((s) => s.project?.sequence.loop ?? false);
  const story = useUiStore((s) => s.story);
  const total = totalDuration(scenes);
  const starts = sceneStartTimes(scenes);
  if (scenes.length === 0) {
    return (
      <div className="timeline" data-testid="timeline">
        <span className="hint">La secuencia está vacía. Genera escenas desde una idea, usa una plantilla o añade la escena actual del estudio.</span>
      </div>
    );
  }
  return (
    <div className="timeline" data-testid="timeline">
      <div className="row">
        <IconButton icon={story.playing ? 'pause' : 'play'} label={story.playing ? 'Pausar secuencia' : 'Reproducir secuencia'} onClick={() => (story.playing ? storyPlayer.pause() : storyPlayer.play())} testId="story-play" />
        <IconButton icon="stop" label="Detener y volver al estudio" onClick={() => storyPlayer.stop()} disabled={!story.active} testId="story-stop" />
        <span className="time" data-testid="story-time">
          {formatTime(story.time)} / {formatTime(total)}
        </span>
        <span className="hint grow">
          {story.active ? `Escena ${story.index + 1}: ${scenes[story.index]?.name ?? ''}` : 'Vista previa detenida: el escenario muestra el estudio.'}
        </span>
        <Toggle label="Bucle" checked={loop} onChange={(v) => useProjectStore.getState().updateSequence({ loop: v })} />
      </div>
      <div
        className="timeline-track"
        role="slider"
        tabIndex={0}
        aria-label="Línea de tiempo"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(story.time)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          storyPlayer.seek(((e.clientX - r.left) / r.width) * total);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') storyPlayer.seek(storyPlayer.time + 1);
          if (e.key === 'ArrowLeft') storyPlayer.seek(storyPlayer.time - 1);
        }}
      >
        {scenes.map((s, i) => (
          <div key={s.id} className="timeline-seg" style={{ width: `${(s.duration / total) * 100}%`, background: worldArt(s.world, s.params) }} aria-current={story.active && story.index === i} title={`${s.name} · ${s.duration}s · ${TRANSITION_LABEL[s.transition.type]}`}>
            {s.name}
            <small>{formatTime(starts[i])}</small>
          </div>
        ))}
        {story.active && <span className="playhead" style={{ left: `${(story.time / total) * 100}%` }} />}
      </div>
    </div>
  );
}

function SceneEditor({ scene, index }: { scene: StoryScene; index: number }) {
  const { updateScene } = useProjectStore.getState();
  const tracks = useProjectStore((s) => s.project?.audio.tracks ?? []);
  const takeFromStudio = () => {
    const p = useProjectStore.getState().project!;
    updateScene(scene.id, { world: p.scene.world, params: { ...p.scene.params }, bindings: p.audio.bindings.length ? p.audio.bindings : undefined });
    useUiStore.getState().toast('La escena ahora usa los parámetros actuales del estudio', 'success');
    storyPlayer.preview(index);
  };
  const editInStudio = () => {
    storyPlayer.stop();
    const store = useProjectStore.getState();
    store.commit((p) => ({ ...p, scene: { world: scene.world, params: { ...scene.params } } }));
    useUiStore.getState().setMode('studio');
    useUiStore.getState().toast(`Editando «${scene.name}» en el estudio. Vuelve a Story y pulsa «Tomar del estudio» para guardar los cambios en la escena.`, 'info');
  };
  return (
    <div className="card stack" data-testid="scene-editor">
      <div className="row">
        <h3 style={{ margin: 0 }} className="grow">
          Escena {index + 1}
        </h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => storyPlayer.preview(index)}>
          <Icon name="eye" /> Ver
        </button>
      </div>
      <div className="field">
        <label htmlFor="scene-name">Nombre</label>
        <input id="scene-name" className="input" value={scene.name} maxLength={80} onChange={(e) => updateScene(scene.id, { name: e.target.value || 'Escena' }, `scene-name:${scene.id}`)} data-testid="scene-name" />
      </div>
      <div className="field">
        <label htmlFor="scene-desc">Descripción</label>
        <textarea id="scene-desc" className="textarea" value={scene.description} maxLength={600} onChange={(e) => updateScene(scene.id, { description: e.target.value }, `scene-desc:${scene.id}`)} />
      </div>
      <Slider label="Duración" value={scene.duration} min={1} max={60} step={0.5} unit=" s" onChange={(v) => updateScene(scene.id, { duration: v }, `scene-dur:${scene.id}`)} testId="scene-duration" />
      <Select<WorldId>
        label="Mundo"
        value={scene.world}
        options={WORLD_IDS.map((w) => ({ value: w, label: WORLDS[w].name }))}
        onChange={(w) => {
          updateScene(scene.id, { world: w, params: worldPreset(w) });
          storyPlayer.preview(index);
        }}
      />
      <div className="grid-2">
        <Select<TransitionType> label="Transición de entrada" value={scene.transition.type} options={TRANSITIONS.map((t) => ({ value: t, label: TRANSITION_LABEL[t] }))} onChange={(t) => updateScene(scene.id, { transition: { ...scene.transition, type: t } })} testId="scene-transition" />
        <Slider label="Duración transición" value={scene.transition.duration} min={0} max={5} step={0.1} unit=" s" onChange={(v) => updateScene(scene.id, { transition: { ...scene.transition, duration: v } }, `scene-tr:${scene.id}`)} />
      </div>
      <Select
        label="Audio de la escena"
        value={scene.audio.trackId ?? ''}
        options={[{ value: '', label: 'Continuar el audio actual' }, ...tracks.map((t) => ({ value: t.id, label: t.name }))]}
        onChange={(v) => updateScene(scene.id, { audio: { ...scene.audio, trackId: v || null } })}
      />
      {scene.bindings && scene.bindings.length > 0 && <p className="hint">Esta escena tiene {scene.bindings.length} vinculación(es) de audio propias.</p>}
      <div className="row wrap">
        <button type="button" className="btn btn-sm" onClick={takeFromStudio} data-testid="scene-take-studio">
          <Icon name="download" /> Tomar del estudio
        </button>
        <button type="button" className="btn btn-sm" onClick={editInStudio}>
          <Icon name="edit" /> Editar en el estudio
        </button>
      </div>
    </div>
  );
}

export function StoryPanel() {
  const project = useProjectStore((s) => s.project);
  const caps = useUiStore((s) => s.capabilities);
  const [selected, setSelected] = useState<string | null>(null);
  const [idea, setIdea] = useState('');
  const [count, setCount] = useState(4);
  const [total, setTotal] = useState(32);
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingReplace, setPendingReplace] = useState<StoryScene[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StoryScene | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    if (project && !idea) setIdea(project.sequence.idea);
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => storyPlayer.stop(), []);
  if (!project) return null;
  const { scenes, consistency } = project.sequence;
  const store = useProjectStore.getState();
  const sel = scenes.find((s) => s.id === selected) ?? null;
  const selIndex = sel ? scenes.indexOf(sel) : -1;

  const applyScenes = (next: StoryScene[]) => {
    store.updateSequence({ idea });
    store.replaceScenes(next);
    setSelected(next[0]?.id ?? null);
    storyPlayer.stop();
    useUiStore.getState().toast(`${next.length} escena(s) creadas`, 'success');
  };
  const offer = (next: StoryScene[]) => {
    if (next.length === 0) return;
    if (scenes.length > 0) setPendingReplace(next);
    else applyScenes(next);
  };

  const generate = async () => {
    setError(null);
    setNotes([]);
    if (idea.trim().length < 3) {
      setError('Escribe una idea de al menos unas palabras.');
      return;
    }
    if (useAi && caps?.ai.available) {
      setBusy(true);
      try {
        const plan = await storyWithAi({ idea, sceneCount: count, totalDurationSec: total, consistent: consistency.enabled });
        setNotes([`Guion generado con ${plan.provider}: «${plan.title}».`]);
        store.updateSequence({ title: plan.title });
        offer(scenesFromPlan(plan));
      } catch (e) {
        setError(`${e instanceof ApiError || e instanceof Error ? e.message : 'Error'} Puedes usar el generador local.`);
      } finally {
        setBusy(false);
      }
      return;
    }
    const r = scenesFromIdea(idea, { totalDuration: total, maxScenes: count, fallbackWorld: project.scene.world });
    setNotes(r.notes);
    offer(r.scenes);
  };

  const sceneDurationSum = totalDuration(scenes);

  return (
    <div className="inspector-inner" data-testid="panel-story">
      <div className="panel-header">
        <div>
          <h2>Story Worlds</h2>
          <p>Convierte una idea en una secuencia de escenas reproducible.</p>
        </div>
      </div>

      <Section title="Crear desde una idea">
        <div className="field">
          <label htmlFor="story-idea">Idea narrativa</label>
          <textarea
            id="story-idea"
            className="textarea"
            data-testid="story-idea"
            placeholder="Ej.: Una noche serena en el mar. Luego el agua se ilumina con partículas doradas. Después viajamos al espacio entre estrellas misteriosas. Finalmente amanece sobre las montañas."
            value={idea}
            maxLength={4000}
            onChange={(e) => setIdea(e.target.value)}
          />
        </div>
        <div className="grid-2">
          <Slider label="Máx. escenas" value={count} min={2} max={12} step={1} onChange={setCount} />
          <Slider label="Duración total" value={total} min={10} max={300} step={1} unit=" s" onChange={setTotal} />
        </div>
        <div className="segmented" role="group" aria-label="Generador">
          <button type="button" aria-pressed={!useAi} onClick={() => setUseAi(false)}>
            Local (plantillas y reglas)
          </button>
          <button type="button" aria-pressed={useAi} disabled={!caps?.ai.available} onClick={() => setUseAi(true)} title={caps?.ai.available ? '' : caps?.ai.reason ?? ''}>
            IA {caps?.ai.available ? '' : '(no configurada)'}
          </button>
        </div>
        <p className="hint">
          {useAi
            ? 'La IA propone un guion con operaciones validadas; las escenas se construyen con los presets reales del motor.'
            : 'El generador local divide la idea en momentos (frases, «luego», «después»…), elige mundo por palabras clave e interpreta cada frase con el intérprete de reglas. No inventa momentos que no escribiste.'}
        </p>
        {error && <Notice kind="error">{error}</Notice>}
        {notes.map((n, i) => (
          <p key={i} className="hint">
            {n}
          </p>
        ))}
        <button type="button" className="btn btn-primary" onClick={generate} disabled={busy} data-testid="story-generate">
          {busy ? <span className="spinner" /> : <Icon name="sparkles" />} Generar escenas
        </button>
      </Section>

      <Section title="Plantillas" defaultOpen={scenes.length === 0}>
        {STORY_TEMPLATES.map((t) => (
          <div key={t.id} className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div style={{ fontWeight: 600, fontSize: 12.5 }}>{t.name}</div>
              <div className="hint">
                {t.summary} · {t.scenes.length} escenas
              </div>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => offer(scenesFromTemplate(t.id))} data-testid={`template-${t.id}`}>
              Usar
            </button>
          </div>
        ))}
      </Section>

      <Section title="Escenas" badge={<span className="section-badge">{scenes.length} · {formatTime(sceneDurationSum)}</span>}>
        <div className="scene-list" data-testid="scene-list">
          {scenes.map((s, i) => (
            <div
              key={s.id}
              className={`scene-item${dragOver === i ? ' drag-over' : ''}`}
              aria-current={selected === s.id}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(i);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => {
                if (dragFrom !== null) store.moveScene(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              onClick={() => {
                setSelected(s.id);
                storyPlayer.preview(i);
              }}
              data-testid="scene-item"
            >
              <span className="drag-handle" title="Arrastra para reordenar">
                <Icon name="grip" />
              </span>
              <span className="scene-index">{i + 1}</span>
              <span className="scene-thumb" style={{ background: worldArt(s.world, s.params) }} />
              <div className="grow">
                <div className="track-name">{s.name}</div>
                <div className="track-meta">
                  {WORLDS[s.world].name} · {s.duration}s · {TRANSITION_LABEL[s.transition.type]}
                </div>
              </div>
              <div className="row" style={{ gap: 0 }} onClick={(e) => e.stopPropagation()}>
                <IconButton icon="up" size="sm" label="Subir" onClick={() => store.moveScene(i, i - 1)} disabled={i === 0} />
                <IconButton icon="down" size="sm" label="Bajar" onClick={() => store.moveScene(i, i + 1)} disabled={i === scenes.length - 1} testId="scene-down" />
                <IconButton icon="copy" size="sm" label="Duplicar" onClick={() => store.duplicateScene(s.id)} testId="scene-duplicate" />
                <IconButton icon="trash" size="sm" label="Eliminar" onClick={() => setConfirmDelete(s)} testId="scene-delete" />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => store.addScene()} data-testid="scene-add">
          <Icon name="plus" /> Añadir la escena actual del estudio
        </button>
      </Section>

      {sel && <SceneEditor scene={sel} index={selIndex} />}

      <Section title="Consistencia entre escenas" defaultOpen={false}>
        <Toggle label="Mantener consistencia (la primera escena define el estilo)" checked={consistency.enabled} onChange={(v) => store.updateSequence({ consistency: { ...consistency, enabled: v } })} testId="consistency-toggle" />
        <div className="chips">
          {CONSISTENCY_LOCKS.map((l) => (
            <label key={l} className="toggle" style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={consistency.locks.includes(l)}
                onChange={(e) => store.updateSequence({ consistency: { ...consistency, locks: e.target.checked ? [...consistency.locks, l] : consistency.locks.filter((x) => x !== l) } })}
              />
              <span className="track" />
              {LOCK_LABEL[l]}
            </label>
          ))}
        </div>
        <p className="hint">Con la consistencia activa, los grupos marcados se copian de la escena 1 al resto cada vez que editas la secuencia.</p>
      </Section>

      {pendingReplace && (
        <ConfirmDialog
          title="¿Reemplazar la secuencia?"
          message={`La secuencia actual tiene ${scenes.length} escena(s). Puedes reemplazarla o añadir las ${pendingReplace.length} nuevas al final. Podrás recuperar la anterior con Deshacer o desde Versiones.`}
          confirmLabel="Reemplazar"
          onCancel={() => setPendingReplace(null)}
          onConfirm={() => {
            applyScenes(pendingReplace);
            setPendingReplace(null);
          }}
        >
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              store.replaceScenes([...scenes, ...pendingReplace]);
              setPendingReplace(null);
            }}
          >
            Añadir al final
          </button>
        </ConfirmDialog>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="¿Eliminar escena?"
          message={`«${confirmDelete.name}» se eliminará de la secuencia.`}
          confirmLabel="Eliminar"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            store.removeScene(confirmDelete.id);
            if (selected === confirmDelete.id) setSelected(null);
            setConfirmDelete(null);
          }}
        />
      )}
    </div>
  );
}
