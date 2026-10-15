import { useState } from 'react';
import type { AppliedChange } from '../../shared/operations';
import { ApiError, interpretWithAi } from '../integrations/apiClient';
import { LOCAL_CAPABILITIES, interpretLocally } from '../nlp/localInterpreter';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { Icon } from './components/Icon';

const EXAMPLES = ['Haz el movimiento más lento', 'Añade partículas doradas', 'Crea una atmósfera más misteriosa', 'Haz que las formas reaccionen a los graves', 'Cámara en travesía y mucha niebla', 'Luz roja y olas más altas'];

interface Result {
  source: 'local' | 'ai';
  provider?: string;
  instruction: string;
  notes: string[];
  changes: AppliedChange[];
  unmatched: string[];
  rejected: number;
  error?: string;
}

export function PromptBar() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<'local' | 'ai'>('local');
  const [result, setResult] = useState<Result | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const caps = useUiStore((s) => s.capabilities);
  const aiAvailable = !!caps?.ai.available;
  const applyOps = useProjectStore((s) => s.applyOps);
  const undo = useProjectStore((s) => s.undo);

  const runLocal = (instruction: string) => {
    const world = useProjectStore.getState().project!.scene.world;
    const interp = interpretLocally(instruction, world);
    const r = interp.operations.length ? applyOps(interp.operations) : null;
    setResult({ source: 'local', instruction, notes: interp.notes, changes: r?.changes ?? [], unmatched: interp.unmatched, rejected: r?.rejected.length ?? 0 });
  };

  const runAi = async (instruction: string) => {
    const p = useProjectStore.getState().project!;
    try {
      const plan = await interpretWithAi(instruction, { world: p.scene.world, params: p.scene.params, bindings: p.audio.bindings });
      const r = applyOps(plan.operations);
      setResult({ source: 'ai', provider: plan.provider, instruction, notes: plan.explanation ? [plan.explanation] : [], changes: r?.changes ?? [], unmatched: [], rejected: r?.rejected.length ?? 0 });
    } catch (e) {
      setResult({ source: 'ai', instruction, notes: [], changes: [], unmatched: [], rejected: 0, error: e instanceof ApiError || e instanceof Error ? e.message : 'Error desconocido' });
    }
  };

  const submit = async (value = text) => {
    const instruction = value.trim();
    if (!instruction || busy) return;
    setBusy(true);
    try {
      if (engine === 'ai' && aiAvailable) await runAi(instruction);
      else runLocal(instruction);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="prompt" aria-label="Editor por lenguaje natural" data-testid="prompt-bar">
      <div className="prompt-input-row">
        <label htmlFor="prompt-input" className="sr-only">
          Describe un cambio para la escena
        </label>
        <textarea
          id="prompt-input"
          data-testid="prompt-input"
          rows={1}
          value={text}
          placeholder="Describe un cambio: «haz el movimiento más lento», «añade partículas doradas»…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          maxLength={1000}
        />
        <button type="button" className="btn btn-primary" onClick={() => submit()} disabled={busy || !text.trim()} data-testid="prompt-submit">
          {busy ? <span className="spinner" /> : <Icon name="send" />}
          <span>Aplicar</span>
        </button>
      </div>
      <div className="prompt-meta">
        <div className="segmented" role="group" aria-label="Intérprete" style={{ padding: 2 }}>
          <button type="button" aria-pressed={engine === 'local'} onClick={() => setEngine('local')} data-testid="interp-local">
            Local (reglas)
          </button>
          <button
            type="button"
            aria-pressed={engine === 'ai'}
            disabled={!aiAvailable}
            onClick={() => setEngine('ai')}
            title={aiAvailable ? `IA: ${caps?.ai.provider} · ${caps?.ai.model}` : caps?.ai.reason ?? 'IA no configurada'}
            data-testid="interp-ai"
          >
            IA {aiAvailable ? `· ${caps?.ai.provider}` : '· no configurada'}
          </button>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
          <Icon name="info" /> ¿Qué entiende?
        </button>
        <div className="chips" style={{ flex: 1 }}>
          {EXAMPLES.slice(0, 4).map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => submit(ex)} disabled={busy}>
              {ex}
            </button>
          ))}
        </div>
      </div>
      {showHelp && (
        <div className="prompt-result">
          <div className="hint">
            <strong>Intérprete local</strong> (sin conexión, basado en reglas). Reconoce:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {LOCAL_CAPABILITIES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p style={{ margin: '6px 0 0' }}>
              No entiende metáforas complejas ni referencias a objetos que el motor no tiene.{' '}
              {aiAvailable
                ? 'Para instrucciones abiertas usa el modo IA: el modelo solo puede proponer operaciones del mismo esquema validado.'
                : `El modo IA está desactivado: ${caps?.ai.reason ?? 'no hay un proveedor configurado en el servidor'}.`}
            </p>
          </div>
        </div>
      )}
      {result && (
        <div className="prompt-result" data-testid="prompt-result" aria-live="polite">
          <div className="row wrap">
            <span className={`badge ${result.source === 'ai' ? 'violet' : 'accent'}`}>{result.source === 'ai' ? `IA · ${result.provider ?? '—'}` : 'Local'}</span>
            <span className="hint grow">«{result.instruction}»</span>
            {result.changes.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  undo();
                  setResult(null);
                }}
                data-testid="prompt-undo"
              >
                <Icon name="undo" /> Deshacer
              </button>
            )}
          </div>
          {result.error && (
            <div className="notice error">
              <Icon name="warning" />
              <div>
                {result.error}{' '}
                <button type="button" className="btn btn-sm" onClick={() => runLocal(result.instruction)}>
                  Probar con el intérprete local
                </button>
              </div>
            </div>
          )}
          {result.notes.map((n, i) => (
            <div key={i} className="hint">
              {n}
            </div>
          ))}
          {result.changes.length > 0 && (
            <ul className="change-list" data-testid="prompt-changes">
              {result.changes.slice(0, 14).map((c, i) => (
                <li key={i}>
                  {c.label}: {c.before} → <b>{c.after}</b>
                </li>
              ))}
              {result.changes.length > 14 && <li>+{result.changes.length - 14} más</li>}
            </ul>
          )}
          {result.unmatched.length > 0 && (
            <div className="notice warn" data-testid="prompt-unmatched">
              <Icon name="warning" />
              <div>
                No reconocí: {result.unmatched.map((u) => `«${u}»`).join(', ')}. Pulsa «¿Qué entiende?» para ver el vocabulario disponible
                {aiAvailable ? ' o prueba el modo IA.' : '.'}
              </div>
            </div>
          )}
          {!result.error && result.changes.length === 0 && result.unmatched.length === 0 && <div className="hint">La escena ya cumplía esa instrucción; no hubo cambios.</div>}
          {result.rejected > 0 && <div className="hint">{result.rejected} operación(es) rechazada(s) por no cumplir el esquema.</div>}
        </div>
      )}
    </section>
  );
}
