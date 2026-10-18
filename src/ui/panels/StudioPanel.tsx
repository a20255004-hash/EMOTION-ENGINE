import { useEffect, useState } from 'react';
import { PARAM_DEFS, PARAM_GROUPS, PARAM_IDS, WORLD_IDS, type ParamId, type VisualParams, type WorldId } from '../../../shared/params';
import { MOODS, MOOD_IDS, PALETTES, WORLDS, worldPreset } from '../../../shared/presets';
import { SOUNDSCAPE_INFO } from '../../audio/soundscape';
import { surprise } from '../actions';
import { getEngine } from '../../engine/host';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { ColorField, Section, Select, Slider } from '../components/controls';
import { Icon } from '../components/Icon';

export function worldArt(world: WorldId, p?: Partial<VisualParams>) {
  const v = { ...worldPreset(world), ...p };
  const { primaryColor: pc, secondaryColor: sc, accentColor: ac, backgroundColor: bg, lightColor: lc, particleColor: pt } = v;
  switch (world) {
    case 'ocean':
      return `radial-gradient(circle at 70% 28%, ${lc} 0 6%, transparent 7%), linear-gradient(180deg, ${bg} 0%, ${ac}55 48%, ${pc} 52%, ${sc} 100%)`;
    case 'cosmos':
      return `radial-gradient(circle at 50% 55%, ${ac} 0 10%, ${pc} 18%, transparent 40%), radial-gradient(ellipse at 50% 55%, ${pt}44 0 45%, transparent 60%), ${bg}`;
    case 'atmosphere':
      return `linear-gradient(170deg, transparent 55%, ${pc} 56% 100%), linear-gradient(200deg, transparent 50%, ${sc} 51% 100%), radial-gradient(circle at 30% 62%, ${lc} 0 5%, transparent 22%), linear-gradient(180deg, ${sc} 0%, ${bg} 70%)`;
    case 'aurora':
      return `radial-gradient(ellipse 30% 45% at 35% 30%, ${pc}cc 0, transparent 70%), radial-gradient(ellipse 25% 40% at 68% 25%, ${ac}aa 0, transparent 70%), linear-gradient(180deg, ${bg} 0 58%, #b9c7da 60% 100%)`;
    case 'forest':
      return `radial-gradient(circle at 75% 22%, ${lc} 0 4%, transparent 5%), radial-gradient(circle at 28% 74%, ${ac} 0 2%, transparent 3.5%), radial-gradient(circle at 58% 82%, ${pt} 0 1.5%, transparent 3%), radial-gradient(circle at 44% 64%, ${pt} 0 1.2%, transparent 2.5%), linear-gradient(180deg, ${bg} 0%, ${pc} 62%, ${sc} 100%)`;
    case 'neon':
      return `repeating-linear-gradient(90deg, ${ac}88 0 1px, transparent 1px 14px) 0 100% / 100% 42% no-repeat, repeating-linear-gradient(0deg, ${ac}88 0 1px, transparent 1px 9px) 0 100% / 100% 42% no-repeat, radial-gradient(circle at 50% 58%, ${lc} 0 13%, ${pc} 14% 20%, transparent 21%), linear-gradient(180deg, ${bg} 0%, ${pc}aa 57%, ${sc} 58%)`;
    case 'desert':
      return `radial-gradient(circle at 72% 32%, ${lc} 0 8%, transparent 9%), radial-gradient(ellipse 70% 28% at 25% 88%, ${pc} 0 60%, transparent 61%), radial-gradient(ellipse 70% 30% at 85% 92%, ${ac}cc 0 55%, transparent 56%), linear-gradient(180deg, ${bg} 0 62%, ${sc} 63% 100%)`;
    case 'abyss':
      return `linear-gradient(165deg, ${lc}44 0 8%, transparent 30%), radial-gradient(ellipse 12% 9% at 62% 38%, ${ac} 0, transparent 100%), radial-gradient(ellipse 8% 6% at 30% 55%, ${ac}aa 0, transparent 100%), linear-gradient(180deg, ${pc} 0%, ${bg} 100%)`;
    case 'crystal':
      return `radial-gradient(circle at 50% 50%, ${lc} 0 4%, transparent 18%), conic-gradient(from 210deg at 50% 52%, ${pc}, ${ac}, ${sc}, ${pc}, ${ac}88, ${sc}, ${pc})`;
    case 'vortex':
      return `radial-gradient(circle at 50% 50%, ${lc} 0 5%, transparent 12%), repeating-radial-gradient(circle at 50% 50%, ${pc} 0 7px, ${ac} 7px 9px, ${bg} 9px 15px)`;
  }
}

const SHORTCUT = (i: number) => (i === 9 ? '0' : String(i + 1));

export function WorldPicker() {
  const world = useProjectStore((s) => s.project?.scene.world);
  const setWorld = useProjectStore((s) => s.setWorld);
  return (
    <div className="stack">
      <div className="world-grid" role="group" aria-label="Escenarios">
        {WORLD_IDS.map((id, i) => (
          <button key={id} type="button" className="world-card" aria-pressed={world === id} onClick={() => setWorld(id)} title={`${WORLDS[id].tagline} · tecla ${SHORTCUT(i)}`} data-testid={`world-${id}`}>
            <span className="art" style={{ background: worldArt(id) }} />
            <kbd className="world-key" aria-hidden>
              {SHORTCUT(i)}
            </kbd>
            <span className="name">{WORLDS[id].name}</span>
            <span className="tag">{WORLDS[id].tagline}</span>
          </button>
        ))}
      </div>
      {world && (
        <p className="hint">
          {WORLDS[world].description} <span className="sound-note">Sonido: {SOUNDSCAPE_INFO[world].toLowerCase()}.</span>
        </p>
      )}
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
          <p>10 escenarios vivos. Elige uno y ajústalo en tiempo real.</p>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-sm" onClick={surprise} title="Escena al azar (S)" data-testid="btn-surprise-panel">
            <Icon name="dice" /> Sorpréndeme
          </button>
          <button className="btn btn-ghost btn-sm" onClick={resetParams} title="Restablecer el preset del mundo" data-testid="btn-reset-params">
            <Icon name="reset" /> Preset
          </button>
        </div>
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
      <div className="card">
        <h3>Paletas</h3>
        <div className="palette-row">
          {PALETTES.map((pl) => (
            <button
              key={pl.id}
              type="button"
              className="palette-chip"
              title={`Paleta ${pl.label}`}
              aria-label={`Paleta ${pl.label}`}
              onClick={() => applyOps(Object.entries(pl.colors).map(([param, value]) => ({ op: 'setColor', param, value })))}
              data-testid={`palette-${pl.id}`}
            >
              <span style={{ background: `linear-gradient(135deg, ${pl.colors.backgroundColor} 0 30%, ${pl.colors.primaryColor} 30% 60%, ${pl.colors.accentColor} 60%)` }} />
              {pl.label}
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
        Atajos: <kbd>1</kbd>–<kbd>0</kbd> escenarios · <kbd>S</kbd> sorpresa · <kbd>M</kbd> sonido · <kbd>H</kbd> ayuda · <kbd>Espacio</kbd> pausa · <kbd>R</kbd> reinicia · <kbd>P</kbd> captura · <kbd>F</kbd> pantalla completa · <kbd>Ctrl/⌘ Z</kbd> deshacer. Arrastra el escenario para orbitar y usa la rueda o el pellizco para acercar.
      </p>
    </div>
  );
}
