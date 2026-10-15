import { useEffect, useState } from 'react';
import { PARAM_DEFS, PARAM_GROUPS, PARAM_IDS, WORLD_IDS, type ParamId, type VisualParams, type WorldId } from '../../../shared/params';
import { MOODS, MOOD_IDS, WORLDS, worldPreset } from '../../../shared/presets';
import { getEngine } from '../../engine/host';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { ColorField, Section, Select, Slider } from '../components/controls';
import { Icon } from '../components/Icon';

export function worldArt(world: WorldId, p?: Partial<VisualParams>) {
  const v = { ...worldPreset(world), ...p };
  if (world === 'ocean')
    return `radial-gradient(circle at 70% 28%, ${v.lightColor} 0 6%, transparent 7%), linear-gradient(180deg, ${v.backgroundColor} 0%, ${v.accentColor}55 48%, ${v.primaryColor} 52%, ${v.secondaryColor} 100%)`;
  if (world === 'cosmos')
    return `radial-gradient(circle at 50% 55%, ${v.accentColor} 0 10%, ${v.primaryColor} 18%, transparent 40%), radial-gradient(ellipse at 50% 55%, ${v.particleColor}44 0 45%, transparent 60%), ${v.backgroundColor}`;
  return `linear-gradient(170deg, transparent 55%, ${v.primaryColor} 56% 100%), linear-gradient(200deg, transparent 50%, ${v.secondaryColor} 51% 100%), radial-gradient(circle at 30% 62%, ${v.lightColor} 0 5%, transparent 22%), linear-gradient(180deg, ${v.secondaryColor} 0%, ${v.backgroundColor} 70%)`;
}

export function WorldPicker() {
  const world = useProjectStore((s) => s.project?.scene.world);
  const setWorld = useProjectStore((s) => s.setWorld);
  return (
    <div className="stack">
      <div className="world-grid" role="group" aria-label="Experiencias">
        {WORLD_IDS.map((id) => (
          <button key={id} type="button" className="world-card" aria-pressed={world === id} onClick={() => setWorld(id)} title={WORLDS[id].tagline} data-testid={`world-${id}`}>
            <span className="art" style={{ background: worldArt(id) }} />
            <span className="name">{WORLDS[id].name}</span>
          </button>
        ))}
      </div>
      {world && <p className="hint">{WORLDS[world].description}</p>}
    </div>
  );
}

/** Lee del motor los valores efectivos (con audio) unas 8 veces por segundo. */
function useEffectiveParams(active: boolean) {
  const [eff, setEff] = useState<VisualParams | null>(null);
  useEffect(() => {
    if (!active) {
      setEff(null);
      return;
    }
    const t = setInterval(() => setEff(getEngine()?.currentParams ?? null), 125);
    return () => clearInterval(t);
  }, [active]);
  return eff;
}

export function ParamControl({ id, params, effective, onChange }: { id: ParamId; params: VisualParams; effective?: VisualParams | null; onChange: (id: ParamId, v: number | string) => void }) {
  const def = PARAM_DEFS[id];
  const reset = () => {
    const world = useProjectStore.getState().project?.scene.world ?? 'ocean';
    onChange(id, worldPreset(world)[id]);
  };
  if (def.kind === 'number') {
    const eff = effective?.[id] as number | undefined;
    return (
      <Slider
        label={def.label}
        value={params[id] as number}
        min={def.min}
        max={def.max}
        step={def.step}
        unit={def.unit}
        hint={`${def.description}. Doble clic para restablecer.`}
        onChange={(v) => onChange(id, v)}
        onReset={reset}
        modulated={eff != null && Math.abs(eff - (params[id] as number)) > 1e-4 ? eff : null}
        testId={`param-${id}`}
      />
    );
  }
  if (def.kind === 'color') return <ColorField label={def.label} value={params[id] as string} onChange={(v) => onChange(id, v)} testId={`param-${id}`} />;
  return <Select label={def.label} value={params[id] as string} options={def.options} onChange={(v) => onChange(id, v)} testId={`param-${id}`} />;
}

export function StudioPanel() {
  const project = useProjectStore((s) => s.project);
  const setParam = useProjectStore((s) => s.setParam);
  const applyOps = useProjectStore((s) => s.applyOps);
  const resetParams = useProjectStore((s) => s.resetParams);
  const hasBindings = useProjectStore((s) => (s.project?.audio.bindings.some((b) => b.enabled) ?? false) && s.project!.audio.settings.bindingsEnabled);
  const effective = useEffectiveParams(hasBindings);
  if (!project) return null;
  const { params, world } = project.scene;
  const highlights = new Set(WORLDS[world].highlights);

  const applyMood = (mood: (typeof MOOD_IDS)[number]) => {
    const r = applyOps([{ op: 'applyMood', mood, strength: 0.7 }]);
    useUiStore.getState().toast(r && r.changes.length ? `Atmósfera ${MOODS[mood].label.toLowerCase()} aplicada (${r.changes.length} cambios)` : 'Sin cambios', 'info');
  };

  return (
    <div className="inspector-inner" data-testid="panel-studio">
      <div className="panel-header">
        <div>
          <h2>Experience Studio</h2>
          <p>Elige un mundo y ajusta sus parámetros en tiempo real.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={resetParams} title="Restablecer el preset del mundo" data-testid="btn-reset-params">
          <Icon name="reset" /> Preset
        </button>
      </div>
      <WorldPicker />
      <div className="card">
        <h3>Atmósferas rápidas</h3>
        <div className="chips">
          {MOOD_IDS.map((m) => (
            <button key={m} type="button" className="chip" onClick={() => applyMood(m)}>
              {MOODS[m].label}
            </button>
          ))}
        </div>
      </div>
      <Section title="Destacados de este mundo" badge={<span className="section-badge">{highlights.size}</span>}>
        {[...highlights].map((id) => (
          <ParamControl key={id} id={id} params={params} effective={effective} onChange={setParam} />
        ))}
      </Section>
      {PARAM_GROUPS.map((g) => (
        <Section key={g.id} title={g.label} defaultOpen={g.id === 'motion' || g.id === 'color'}>
          {PARAM_IDS.filter((id) => PARAM_DEFS[id].group === g.id).map((id) => (
            <ParamControl key={id} id={id} params={params} effective={effective} onChange={setParam} />
          ))}
        </Section>
      ))}
      <p className="hint">
        Atajos: <kbd>Espacio</kbd> pausa · <kbd>R</kbd> reinicia · <kbd>P</kbd> captura · <kbd>F</kbd> pantalla completa · <kbd>Ctrl/⌘ Z</kbd> deshacer. Arrastra el escenario para orbitar y usa la rueda o el pellizco para acercar.
      </p>
    </div>
  );
}
