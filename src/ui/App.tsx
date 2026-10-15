import { Component, useEffect, useState, type ReactNode } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { fetchCapabilities } from '../integrations/apiClient';
import { useProjectStore } from '../state/projectStore';
import { useUiStore, type Mode } from '../state/uiStore';
import { storyPlayer } from '../story/player';
import { Icon, type IconName } from './components/Icon';
import { IconButton, Notice } from './components/controls';
import { ExportPanel } from './panels/ExportPanel';
import { LibraryPanel } from './panels/LibraryPanel';
import { SoundLabPanel } from './panels/SoundLabPanel';
import { StoryPanel, StoryTimeline } from './panels/StoryPanel';
import { StudioPanel } from './panels/StudioPanel';
import { PromptBar } from './PromptBar';
import { Stage } from './Stage';

const MODES: { id: Mode; label: string; icon: IconName }[] = [
  { id: 'studio', label: 'Studio', icon: 'studio' },
  { id: 'sound', label: 'Sound Lab', icon: 'sound' },
  { id: 'story', label: 'Story', icon: 'story' },
  { id: 'export', label: 'Export', icon: 'export' },
  { id: 'library', label: 'Biblioteca', icon: 'library' },
];

const SAVE_LABEL = { idle: '', unsaved: 'Cambios sin guardar', saving: 'Guardando…', saved: 'Guardado', error: 'Error al guardar' } as const;

function TopBar() {
  const name = useProjectStore((s) => s.project?.name ?? '');
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const saveError = useProjectStore((s) => s.saveError);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const caps = useUiStore((s) => s.capabilities);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const { rename, undo, redo, saveNow } = useProjectStore.getState();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="word">EMOTION ENGINE</span>
        <small>STUDIO</small>
      </div>
      <span className="topbar-sep" />
      <div className="project-title">
        <input
          aria-label="Nombre del proyecto"
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => (draft.trim() ? rename(draft) : setDraft(name))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          data-testid="project-name"
        />
        <span className="save-status" data-status={saveStatus} title={saveError ?? SAVE_LABEL[saveStatus]} data-testid="save-status" aria-live="polite">
          <span className="dot" />
          <span className="label">{SAVE_LABEL[saveStatus]}</span>
        </span>
      </div>
      <div className="topbar-actions">
        <span className="cap-pill optional" data-on={!!caps?.ai.available} title={caps?.ai.available ? `${caps.ai.provider} · ${caps.ai.model}` : caps?.ai.reason ?? ''} data-testid="cap-ai">
          <span className="dot" /> IA {caps?.ai.available ? caps.ai.provider : 'local'}
        </span>
        <IconButton icon="undo" label="Deshacer (Ctrl/⌘ Z)" onClick={undo} disabled={!canUndo} testId="undo" />
        <IconButton icon="redo" label="Rehacer (Ctrl/⌘ Shift Z)" onClick={redo} disabled={!canRedo} testId="redo" />
        <IconButton icon="save" label="Guardar ahora" onClick={() => void saveNow()} disabled={saveStatus === 'saved'} testId="save-now" />
      </div>
    </header>
  );
}

function Rail() {
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  return (
    <nav className="rail" aria-label="Módulos">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className="rail-btn"
          aria-current={mode === m.id ? 'page' : undefined}
          onClick={() => {
            if (m.id !== 'story' && mode === 'story') storyPlayer.stop();
            setMode(m.id);
          }}
          data-testid={`mode-${m.id}`}
        >
          <Icon name={m.icon} />
          {m.label}
        </button>
      ))}
    </nav>
  );
}

function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind} onClick={() => dismiss(t.id)} data-testid="toast">
          <Icon name={t.kind === 'success' ? 'check' : t.kind === 'info' ? 'info' : 'warning'} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

class PanelBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <div className="inspector-inner">
          <Notice kind="error">
            Este panel ha fallado ({this.state.error.message}). Tu proyecto sigue guardado.{' '}
            <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>
              Reintentar
            </button>
          </Notice>
        </div>
      );
    return this.props.children;
  }
}

export function App() {
  const ready = useProjectStore((s) => s.ready);
  const bootError = useProjectStore((s) => s.bootError);
  const recovered = useProjectStore((s) => s.recoveredNotice);
  const mode = useUiStore((s) => s.mode);
  const projectId = useProjectStore((s) => s.project?.id);

  useEffect(() => {
    void useProjectStore.getState().init();
    void fetchCapabilities().then((c) => useUiStore.getState().setCapabilities(c));
  }, []);

  // El audio se configura según el proyecto aunque Sound Lab esté cerrado.
  useEffect(
    () =>
      useProjectStore.subscribe(
        (s) => s.project?.audio.settings,
        (settings) => settings && audioEngine.configure(settings),
        { fireImmediately: true },
      ),
    [],
  );

  // Al cambiar de proyecto se detiene el audio y la secuencia del anterior.
  useEffect(() => {
    storyPlayer.stop();
    audioEngine.unload();
  }, [projectId]);

  useEffect(() => {
    if (recovered) {
      useUiStore.getState().toast(recovered, 'warning');
      useProjectStore.getState().dismissRecovered();
    }
  }, [recovered]);
  useEffect(() => {
    if (bootError) useUiStore.getState().toast(bootError, 'error');
  }, [bootError]);

  if (!ready) {
    return (
      <div className="boot" role="status">
        <span className="spinner" /> Preparando el estudio…
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <Rail />
        <main className="stage-column">
          <Stage />
          {mode === 'studio' && <PromptBar />}
          {mode === 'story' && <StoryTimeline />}
        </main>
        <aside className="inspector" aria-label="Panel de propiedades">
          <PanelBoundary resetKey={mode}>
            {mode === 'studio' && <StudioPanel />}
            {mode === 'sound' && <SoundLabPanel />}
            {mode === 'story' && <StoryPanel />}
            {mode === 'export' && <ExportPanel />}
            {mode === 'library' && <LibraryPanel />}
          </PanelBoundary>
        </aside>
      </div>
      <Toasts />
    </div>
  );
}
