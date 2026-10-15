import { useCallback, useEffect, useRef, useState } from 'react';
import { CAMERA_MODES, PARAM_DEFS, type CameraMode } from '../../shared/params';
import { WORLDS } from '../../shared/presets';
import { Engine, WebGLUnavailableError } from '../engine/Engine';
import { attachEngine, getEngine } from '../engine/host';
import { audioEngine } from '../audio/AudioEngine';
import { downloadBlob, safeFileName, timestamp } from '../export/files';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { storyPlayer } from '../story/player';
import { Icon } from './components/Icon';
import { IconButton } from './components/controls';

const CAMERA_LABEL = Object.fromEntries(PARAM_DEFS.cameraMode.options.map((o) => [o.value, o.label])) as Record<CameraMode, string>;

export function Stage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const paused = useUiStore((s) => s.paused);
  const stats = useUiStore((s) => s.stats);
  const engineError = useUiStore((s) => s.engineError);
  const hudHidden = useUiStore((s) => s.hudHidden);
  const recording = useUiStore((s) => s.recording);
  const story = useUiStore((s) => s.story);
  const world = useProjectStore((s) => s.project?.scene.world ?? 'ocean');
  const cameraMode = useProjectStore((s) => s.project?.scene.params.cameraMode ?? 'orbit');
  const projectName = useProjectStore((s) => s.project?.name ?? 'proyecto');

  useEffect(() => {
    const host = hostRef.current;
    const p = useProjectStore.getState().project;
    if (!host || !p) return;
    let engine: Engine;
    try {
      engine = new Engine(host, p.scene.world, p.scene.params);
    } catch (e) {
      useUiStore
        .getState()
        .setEngineError(
          e instanceof WebGLUnavailableError
            ? 'Tu navegador o tu tarjeta gráfica no tienen WebGL disponible. Activa la aceleración por hardware o prueba con Chrome, Edge, Firefox o Safari recientes.'
            : `No se pudo iniciar el motor visual: ${e instanceof Error ? e.message : 'error desconocido'}`,
        );
      return;
    }
    engine.onContextLost = () => useUiStore.getState().setEngineError('La GPU ha reiniciado el contexto gráfico. Recarga la página para continuar; tu proyecto está guardado.');
    const detach = attachEngine(engine);
    const unsubStats = engine.subscribe((s) => useUiStore.getState().setStats(s));
    // Ganchos de inspección para pruebas automatizadas y depuración (solo con ?debug o en desarrollo).
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) Object.assign(window, { __engine: engine, __audio: audioEngine, __store: useProjectStore });
    // Miniatura para la biblioteca: al poco de abrir y periódicamente.
    const thumbTimer = setInterval(() => {
      if (!document.hidden) useProjectStore.getState().setThumbnail(engine.thumbnail());
    }, 45000);
    const firstThumb = setTimeout(() => useProjectStore.getState().setThumbnail(engine.thumbnail()), 2500);
    return () => {
      clearInterval(thumbTimer);
      clearTimeout(firstThumb);
      unsubStats();
      detach();
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const togglePause = useCallback(() => {
    const e = getEngine();
    if (!e) return;
    if (useUiStore.getState().story.active) {
      if (storyPlayer.playing) storyPlayer.pause();
      else storyPlayer.play();
      return;
    }
    useUiStore.getState().setPaused(e.togglePause());
  }, []);

  const reset = useCallback(() => {
    getEngine()?.reset();
    useUiStore.getState().toast('Animación y cámara reiniciadas', 'info');
  }, []);

  const capture = useCallback(async () => {
    const e = getEngine();
    if (!e) return;
    const { image } = useProjectStore.getState().project!.exportSettings;
    try {
      const r = await e.capture({ scale: 1, format: image.format, quality: image.quality });
      downloadBlob(r.blob, `${safeFileName(projectName)}-${timestamp()}.${image.format === 'jpeg' ? 'jpg' : image.format}`);
      useUiStore.getState().toast(`Captura guardada (${r.width}×${r.height})`, 'success');
    } catch (err) {
      useUiStore.getState().toast(err instanceof Error ? err.message : 'No se pudo capturar', 'error');
    }
  }, [projectName]);

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el.requestFullscreen) await el.requestFullscreen();
      else useUiStore.getState().toast('Pantalla completa no disponible en este navegador', 'warning');
    } catch {
      useUiStore.getState().toast('El navegador bloqueó la pantalla completa', 'warning');
    }
  }, []);

  const cycleCamera = () => {
    const i = CAMERA_MODES.indexOf(cameraMode);
    useProjectStore.getState().setParam('cameraMode', CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
  };

  // Atajos de teclado (fuera de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'f' || e.key === 'F') void toggleFullscreen();
      else if (e.key === 'r' || e.key === 'R') reset();
      else if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey) void capture();
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useProjectStore.getState().redo();
        else useProjectStore.getState().undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, toggleFullscreen, reset, capture]);

  const isPlaying = story.active ? story.playing : !paused;

  return (
    <section className="stage" ref={stageRef} data-hud={hudHidden ? 'hidden' : 'shown'} aria-label="Escenario">
      <div className="stage-canvas-host" ref={hostRef} />
      {engineError && (
        <div className="stage-overlay" role="alert">
          <div className="card">
            <h3>El escenario no puede renderizarse</h3>
            <p className="hint">{engineError}</p>
            <button className="btn" onClick={() => location.reload()}>
              Recargar
            </button>
          </div>
        </div>
      )}
      <div className="hud hud-top">
        <div className="glass hud-chip" data-testid="hud-world">
          <span className="hide-sm">{story.active ? 'Secuencia' : 'Mundo'}</span>
          <strong>{WORLDS[world].name}</strong>
        </div>
        <div className="row">
          {recording && (
            <span className="glass rec-badge" data-testid="rec-badge">
              <span className="dot" /> REC
            </span>
          )}
          {stats && (
            <span className="glass hud-stats" data-testid="hud-stats" title="Fotogramas por segundo · resolución interna">
              {stats.fps} fps · {stats.width}×{stats.height}
            </span>
          )}
        </div>
      </div>
      <div className="hud hud-bottom">
        <div className="glass hud-cluster">
          <IconButton icon={isPlaying ? 'pause' : 'play'} label={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'} onClick={togglePause} testId="btn-pause" />
          <IconButton icon="reset" label="Reiniciar animación y cámara (R)" onClick={reset} testId="btn-reset" />
          <IconButton icon="camera" label="Capturar imagen (P)" onClick={capture} testId="btn-capture" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={cycleCamera} title="Cambiar movimiento de cámara" data-testid="btn-camera-mode">
            <Icon name="orbit" /> {CAMERA_LABEL[cameraMode]}
          </button>
          <IconButton icon={hudHidden ? 'eye' : 'eyeOff'} label={hudHidden ? 'Mostrar controles' : 'Ocultar controles al no pasar el cursor'} onClick={() => useUiStore.getState().setHudHidden(!hudHidden)} />
          <IconButton icon={fullscreen ? 'exitFullscreen' : 'fullscreen'} label={fullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'} onClick={toggleFullscreen} testId="btn-fullscreen" />
        </div>
      </div>
    </section>
  );
}
