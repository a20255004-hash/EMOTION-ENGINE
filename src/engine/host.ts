/**
 * Punto de unión entre la aplicación y el motor: mantiene la instancia activa,
 * sincroniza el estado del proyecto con el escenario y aplica la modulación de
 * audio en cada fotograma.
 */
import { modulate } from '../audio/modulation';
import { audioEngine } from '../audio/AudioEngine';
import { useProjectStore } from '../state/projectStore';
import type { AudioBinding } from '../../shared/schema';
import type { Engine } from './Engine';

let engine: Engine | null = null;
/** Vinculaciones que impone el reproductor de secuencias mientras está activo. */
let overrideBindings: AudioBinding[] | null = null;
let storyOwnsStage = false;

export function getEngine() {
  return engine;
}

export function setStoryControl(active: boolean, bindings: AudioBinding[] | null = null) {
  storyOwnsStage = active;
  overrideBindings = active ? bindings : null;
  if (!active && engine) {
    const p = useProjectStore.getState().project;
    engine.setFade(0);
    if (p) engine.setScene(p.scene.world, p.scene.params);
  }
}

export function isStoryControlling() {
  return storyOwnsStage;
}

export function attachEngine(e: Engine): () => void {
  engine = e;
  const sync = () => {
    const p = useProjectStore.getState().project;
    if (p && !storyOwnsStage) e.setScene(p.scene.world, p.scene.params);
  };
  sync();
  const unsub = useProjectStore.subscribe((s) => s.project?.scene, sync);
  e.setModulator((base) => {
    const p = useProjectStore.getState().project;
    if (!p) return base;
    const settings = p.audio.settings;
    const frame = audioEngine.analyse(settings);
    return modulate(base, overrideBindings ?? p.audio.bindings, frame, settings);
  });
  return () => {
    unsub();
    if (engine === e) engine = null;
  };
}
