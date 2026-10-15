import { useEffect, useRef, useState } from 'react';
import { CAMERA_MODES, PARAM_DEFS, WORLD_IDS, type CameraMode } from '../../shared/params';
import { WORLDS } from '../../shared/presets';
import { Engine, WebGLUnavailableError } from '../engine/Engine';
import { attachEngine } from '../engine/host';
import { audioEngine } from '../audio/AudioEngine';
import { soundscape } from '../audio/soundscape';
import { quickCapture, resetView, surprise, toggleAmbience, toggleFullscreen, togglePause } from './actions';
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

  const cycleCamera = () => {
    const i = CAMERA_MODES.indexOf(cameraMode);
    useProjectStore.getState().setParam('cameraMode', CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
  };

  // Atajos de teclado (fuera de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) useProjectStore.getState().redo();
          else useProjectStore.getState().undo();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (k === 'f') void toggleFullscreen();
      else if (k === 'r') resetView();
      else if (k === 'p') void quickCapture();
      else if (k === 's') surprise();
      else if (k === 'm') toggleAmbience();
      else if (k === 'h' || k === '?') useUiStore.getState().setHelpOpen(true);
      else if (/^[0-9]$/.test(k)) {
        // 1–9 y 0: los diez escenarios.
        const world = WORLD_IDS[k === '0' ? 9 : Number(k) - 1];
        if (world) {
          storyPlayer.stop();
          useProjectStore.getState().setWorld(world);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ambienceOn = useAmbience();
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
          <IconButton icon="reset" label="Reiniciar animación y cámara (R)" onClick={resetView} testId="btn-reset" />
          <IconButton icon="camera" label="Capturar imagen (P)" onClick={quickCapture} testId="btn-capture" />
          <IconButton icon="dice" label="Sorpréndeme: escena al azar (S)" onClick={surprise} testId="btn-surprise" />
          <IconButton icon={ambienceOn ? 'volume' : 'volumeOff'} label={ambienceOn ? 'Silenciar sonido ambiente (M)' : 'Activar sonido ambiente (M)'} onClick={toggleAmbience} pressed={ambienceOn} testId="btn-ambience" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={cycleCamera} title="Cambiar movimiento de cámara" data-testid="btn-camera-mode">
            <Icon name="orbit" /> {CAMERA_LABEL[cameraMode]}
          </button>
          <IconButton icon={hudHidden ? 'eye' : 'eyeOff'} label={hudHidden ? 'Mostrar controles' : 'Ocultar controles al no pasar el cursor'} onClick={() => useUiStore.getState().setHudHidden(!hudHidden)} />
          <IconButton icon={fullscreen ? 'exitFullscreen' : 'fullscreen'} label={fullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'} onClick={toggleFullscreen} testId="btn-fullscreen" />
          <IconButton icon="help" label="Ayuda y atajos (H)" onClick={() => useUiStore.getState().setHelpOpen(true)} testId="btn-help" />
        </div>
      </div>
    </section>
  );
}

/** Estado del paisaje sonoro para los botones. */
export function useAmbience() {
  const [on, setOn] = useState(soundscape.isPlaying);
  useEffect(() => soundscape.subscribe(setOn) as unknown as () => void, []);
  return on;
}
