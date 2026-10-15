/**
 * Reproductor de secuencias: toma el control del escenario, avanza el tiempo en
 * cada fotograma, resuelve la escena y la transición, y gestiona el audio de
 * cada escena. Al detenerse devuelve el escenario al estado del estudio.
 */
import { audioEngine } from '../audio/AudioEngine';
import { ensureTrackLoaded } from '../audio/tracks';
import { getEngine, setStoryControl } from '../engine/host';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { resolveAt, totalDuration } from './sequence';

let unhook: (() => void) | null = null;
let time = 0;
let playing = false;
let lastIndex = -1;
let lastUiUpdate = 0;
let onFinish: (() => void) | null = null;

function scenes() {
  return useProjectStore.getState().project?.sequence.scenes ?? [];
}

async function syncAudio(index: number) {
  const s = scenes()[index];
  if (!s) return;
  const trackId = s.audio.trackId;
  try {
    if (trackId) {
      if (audioEngine.state.trackId !== trackId) {
        await ensureTrackLoaded(trackId);
        if (playing) audioEngine.play(0);
      } else if (playing && !audioEngine.state.playing) audioEngine.play();
    }
  } catch (e) {
    useUiStore.getState().toast(e instanceof Error ? e.message : 'No se pudo cargar el audio de la escena', 'warning');
  }
}

function applyFrame() {
  const engine = getEngine();
  const seq = useProjectStore.getState().project?.sequence;
  if (!engine || !seq) return;
  const frame = resolveAt(seq.scenes, time, seq.loop);
  if (!frame) return;
  setStoryControl(true, frame.bindings.length ? frame.bindings : null);
  engine.setScene(frame.world, frame.params);
  engine.setFade(frame.fade, frame.fadeColor);
  if (frame.index !== lastIndex) {
    lastIndex = frame.index;
    void syncAudio(frame.index);
  }
  const now = performance.now();
  if (now - lastUiUpdate > 100) {
    lastUiUpdate = now;
    useUiStore.getState().setStory({ time, index: frame.index });
  }
}

export const storyPlayer = {
  get time() {
    return time;
  },
  get duration() {
    return totalDuration(scenes());
  },
  get playing() {
    return playing;
  },

  /** Empieza (o reanuda) la reproducción. `finish` se llama al terminar si no hay bucle. */
  play(finish?: () => void) {
    const engine = getEngine();
    if (!engine || scenes().length === 0) return false;
    onFinish = finish ?? null;
    if (time >= this.duration - 0.01) time = 0;
    playing = true;
    lastIndex = -1;
    engine.play();
    useUiStore.getState().setPaused(false);
    useUiStore.getState().setStory({ active: true, playing: true });
    unhook?.();
    unhook = engine.addFrameHook((dt) => {
      if (playing) {
        time += dt;
        const seq = useProjectStore.getState().project?.sequence;
        const total = this.duration;
        if (seq && !seq.loop && time >= total) {
          time = total;
          applyFrame();
          this.pause();
          const cb = onFinish;
          onFinish = null;
          cb?.();
          return;
        }
      }
      applyFrame();
    }) as () => void;
    return true;
  },

  pause() {
    playing = false;
    if (audioEngine.state.playing && audioEngine.state.input === 'track') audioEngine.pause();
    useUiStore.getState().setStory({ playing: false, time });
  },

  seek(t: number) {
    time = Math.max(0, Math.min(t, this.duration));
    lastIndex = -1;
    if (!unhook) {
      // Vista previa sin reproducir: muestra el fotograma de ese instante.
      const engine = getEngine();
      if (!engine) return;
      useUiStore.getState().setStory({ active: true });
      unhook = engine.addFrameHook(() => applyFrame()) as () => void;
    }
    applyFrame();
    useUiStore.getState().setStory({ time });
  },

  /** Muestra una escena concreta (al seleccionarla en el editor). */
  preview(index: number) {
    const s = scenes();
    let t = 0;
    for (let i = 0; i < index && i < s.length; i++) t += s[i].duration;
    const scene = s[index];
    this.seek(t + Math.min(scene ? scene.transition.duration + 0.05 : 0, (scene?.duration ?? 1) * 0.8));
  },

  stop() {
    playing = false;
    unhook?.();
    unhook = null;
    time = 0;
    lastIndex = -1;
    onFinish = null;
    if (audioEngine.state.input === 'track' && audioEngine.state.playing) audioEngine.pause();
    setStoryControl(false);
    useUiStore.getState().setStory({ active: false, playing: false, time: 0, index: 0 });
  },
};
