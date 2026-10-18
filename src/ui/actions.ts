/**
 * Acciones de la plataforma reutilizadas por los botones, los atajos de teclado
 * y las órdenes en lenguaje natural, para que todos hagan exactamente lo mismo.
 */
import { audioEngine } from '../audio/AudioEngine';
import { soundscape } from '../audio/soundscape';
import { addDemoTrack, ensureTrackLoaded } from '../audio/tracks';
import { getEngine } from '../engine/host';
import { downloadBlob, safeFileName, timestamp } from '../export/files';
import type { AppCommand } from '../nlp/commands';
import { surpriseOps } from '../nlp/surprise';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { storyPlayer } from '../story/player';

const toast = (t: string, k?: Parameters<ReturnType<typeof useUiStore.getState>['toast']>[1]) => useUiStore.getState().toast(t, k);

export function surprise() {
  const p = useProjectStore.getState().project;
  if (!p) return;
  storyPlayer.stop();
  const { ops, summary } = surpriseOps(p.scene.world);
  useProjectStore.getState().applyOps(ops);
  toast(`Sorpresa: ${summary}. Ctrl/⌘ Z para volver.`, 'success');
}

export function togglePause() {
  const e = getEngine();
  if (!e) return;
  if (useUiStore.getState().story.active) {
    if (storyPlayer.playing) storyPlayer.pause();
    else storyPlayer.play();
    return;
  }
  useUiStore.getState().setPaused(e.togglePause());
}

export function setPaused(paused: boolean) {
  const e = getEngine();
  if (!e) return;
  if (paused) e.pause();
  else e.play();
  useUiStore.getState().setPaused(paused);
}

export function resetView() {
  getEngine()?.reset();
  toast('Animación y cámara reiniciadas', 'info');
}

export async function quickCapture() {
  const e = getEngine();
  const p = useProjectStore.getState().project;
  if (!e || !p) return;
  const { image } = p.exportSettings;
  try {
    const r = await e.capture({ scale: 1, format: image.format, quality: image.quality });
    const saved = downloadBlob(r.blob, `${safeFileName(p.name)}-${timestamp()}.${image.format === 'jpeg' ? 'jpg' : image.format}`);
    toast(saved ? `Captura guardada (${r.width}×${r.height})` : `Captura creada (${r.width}×${r.height}). En la vista previa en línea las descargas están bloqueadas: ábrela en Export para verla.`, saved ? 'success' : 'warning');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'No se pudo capturar', 'error');
  }
}

export async function toggleFullscreen() {
  const el = document.querySelector('.stage') as HTMLElement | null;
  if (!el) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (el.requestFullscreen) await el.requestFullscreen();
    else toast('Pantalla completa no disponible en este navegador', 'warning');
  } catch {
    toast('El navegador bloqueó la pantalla completa', 'warning');
  }
}

/** Enciende o apaga el paisaje sonoro y recuerda la preferencia en el proyecto. */
export function setAmbience(on: boolean) {
  try {
    if (on) soundscape.start();
    else soundscape.stop();
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo iniciar el audio', 'error');
    return;
  }
  useProjectStore.getState().updateAudioSettings({ ambienceEnabled: on });
}

export function toggleAmbience() {
  setAmbience(!soundscape.isPlaying);
}

export function changeVolume(delta: number) {
  const s = useProjectStore.getState().project?.audio.settings;
  if (!s) return;
  const volume = Math.min(1, Math.max(0, s.volume + delta));
  useProjectStore.getState().updateAudioSettings({ volume }, 'audio:volume');
  toast(`Volumen ${Math.round(volume * 100)} %`, 'info');
}

export async function playDemoMusic() {
  const p = useProjectStore.getState().project;
  if (!p) return;
  audioEngine.ensure();
  const demo = p.audio.tracks.find((t) => t.source === 'demo');
  try {
    if (demo) {
      await ensureTrackLoaded(demo.id);
      useProjectStore.getState().setActiveTrack(demo.id);
    } else await addDemoTrack();
    audioEngine.play(0);
    toast('Sonando la pista de demostración. Vincúlala a la escena en Sound Lab.', 'success');
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo reproducir la música', 'error');
  }
}

/** Ejecuta una orden reconocida por el intérprete. Devuelve un texto breve con el resultado. */
export async function runCommand(cmd: AppCommand): Promise<void> {
  const ui = useUiStore.getState();
  const store = useProjectStore.getState();
  switch (cmd.kind) {
    case 'pause':
      return setPaused(true);
    case 'play':
      return setPaused(false);
    case 'reset':
      return resetView();
    case 'capture':
      return quickCapture();
    case 'fullscreen':
      return toggleFullscreen();
    case 'ambience':
      return setAmbience(cmd.on);
    case 'volume':
      return changeVolume(cmd.delta);
    case 'surprise':
      return surprise();
    case 'undo':
      return store.undo();
    case 'redo':
      return store.redo();
    case 'demoTrack':
      return playDemoMusic();
    case 'saveVersion':
      await store.saveVersion(`Versión ${new Date().toLocaleTimeString()}`);
      return toast('Versión guardada en la biblioteca', 'success');
    case 'storyPlay':
      if (!store.project?.sequence.scenes.length) {
        ui.setMode('story');
        return toast('La secuencia está vacía: crea escenas con una idea o una plantilla.', 'warning');
      }
      ui.setMode('story');
      storyPlayer.play();
      return;
    case 'storyStop':
      return storyPlayer.stop();
    case 'open':
      if (cmd.mode !== 'story') storyPlayer.stop();
      return ui.setMode(cmd.mode);
    case 'help':
      return ui.setHelpOpen(true);
  }
}
