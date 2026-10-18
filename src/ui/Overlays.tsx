import { useEffect, useRef, useState } from 'react';
import { WORLD_IDS } from '../../shared/params';
import { WORLDS } from '../../shared/presets';
import { COMMAND_EXAMPLES } from '../nlp/commands';
import { LOCAL_CAPABILITIES } from '../nlp/localInterpreter';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { setAmbience, surprise } from './actions';
import { Icon } from './components/Icon';
import { worldArt } from './panels/StudioPanel';

const SHORTCUTS: [string, string][] = [
  ['1 – 9, 0', 'Cambiar entre los 10 escenarios'],
  ['S', 'Sorpréndeme: escena al azar'],
  ['M', 'Activar o silenciar el sonido ambiente'],
  ['Espacio', 'Pausar / reanudar'],
  ['R', 'Reiniciar animación y cámara'],
  ['P', 'Capturar imagen'],
  ['F', 'Pantalla completa'],
  ['H', 'Esta ayuda'],
  ['Ctrl/⌘ Z', 'Deshacer (Shift para rehacer)'],
];

function useEscape(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
}

export function HelpDialog() {
  const open = useUiStore((s) => s.helpOpen);
  const close = () => useUiStore.getState().setHelpOpen(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEscape(close);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="help-title" data-testid="help-dialog">
        <div className="row">
          <h2 id="help-title" className="grow">
            Qué puedes hacer
          </h2>
          <button ref={ref} type="button" className="icon-btn" aria-label="Cerrar ayuda" onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="help-grid">
          <section>
            <h3>Escribe o pide</h3>
            <ul className="help-list">
              {LOCAL_CAPABILITIES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="chips" style={{ marginTop: 10 }}>
              {COMMAND_EXAMPLES.map((c) => (
                <span key={c} className="chip static">
                  {c}
                </span>
              ))}
            </div>
          </section>
          <section>
            <h3>Atajos de teclado</h3>
            <dl className="kv shortcuts">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="kv-row">
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <h3 style={{ marginTop: 16 }}>Ratón y pantalla táctil</h3>
            <p className="hint">Arrastra el escenario para orbitar; usa la rueda o pellizca para acercar. Tras soltar, la cámara automática vuelve en 2,5 s.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

const WELCOME_KEY = 'emotion-engine:welcomed-v2';

export function Welcome() {
  const ready = useProjectStore((s) => s.ready);
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(WELCOME_KEY) && !new URLSearchParams(location.search).has('debug');
    } catch {
      return false;
    }
  });
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* noop */
    }
  };
  useEscape(close);
  if (!open || !ready) return null;
  const start = (withSound: boolean, doSurprise = false) => {
    if (withSound) setAmbience(true);
    if (doSurprise) surprise();
    close();
  };
  return (
    <div className="dialog-backdrop welcome-backdrop">
      <div className="dialog welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" data-testid="welcome">
        <div className="welcome-strip" aria-hidden>
          {WORLD_IDS.map((w) => (
            <span key={w} style={{ background: worldArt(w) }} title={WORLDS[w].name} />
          ))}
        </div>
        <h2 id="welcome-title">Te damos la bienvenida a EMOTION ENGINE</h2>
        <p>Un estudio audiovisual que se genera en tu navegador. Diez escenarios vivos, cada uno con su propio sonido, que puedes transformar con controles o con palabras.</p>
        <ol className="welcome-steps">
          <li>
            <strong>Elige un escenario</strong> en el panel o con las teclas 1–0.
          </li>
          <li>
            <strong>Escribe lo que imaginas</strong>: «más lento», «paleta neón», «llévame al bosque», «sorpréndeme».
          </li>
          <li>
            <strong>Añade música</strong> en Sound Lab y haz que la escena reaccione al ritmo.
          </li>
          <li>
            <strong>Cuenta una historia</strong> en Story y expórtala como imagen o vídeo.
          </li>
        </ol>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => start(false)}>
            Entrar sin sonido
          </button>
          <button type="button" className="btn" onClick={() => start(true, true)} data-testid="welcome-surprise">
            <Icon name="dice" /> Sorpréndeme
          </button>
          <button type="button" className="btn btn-primary" onClick={() => start(true)} data-testid="welcome-start">
            <Icon name="volume" /> Entrar con sonido
          </button>
        </div>
      </div>
    </div>
  );
}
