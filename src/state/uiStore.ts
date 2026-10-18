import { create } from 'zustand';
import type { EngineStats } from '../engine/Engine';
import type { Capabilities } from '../integrations/apiClient';

export type Mode = 'studio' | 'sound' | 'story' | 'export' | 'library';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error' | 'warning';
  text: string;
}

interface StoryPlayback {
  active: boolean;
  playing: boolean;
  time: number;
  index: number;
}

interface UiState {
  mode: Mode;
  paused: boolean;
  stats: EngineStats | null;
  engineError: string | null;
  toasts: Toast[];
  story: StoryPlayback;
  capabilities: Capabilities | null;
  hudHidden: boolean;
  recording: boolean;
  helpOpen: boolean;
  setHelpOpen(v: boolean): void;
  setMode(mode: Mode): void;
  setPaused(p: boolean): void;
  setStats(s: EngineStats): void;
  setEngineError(e: string | null): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  setStory(patch: Partial<StoryPlayback>): void;
  setCapabilities(c: Capabilities): void;
  setHudHidden(v: boolean): void;
  setRecording(v: boolean): void;
}

let toastId = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  mode: 'studio',
  paused: false,
  stats: null,
  engineError: null,
  toasts: [],
  story: { active: false, playing: false, time: 0, index: 0 },
  capabilities: null,
  hudHidden: false,
  recording: false,
  helpOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setMode: (mode) => set({ mode }),
  setPaused: (paused) => set({ paused }),
  setStats: (stats) => set({ stats }),
  setEngineError: (engineError) => set({ engineError }),
  toast(text, kind = 'info') {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 4200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setStory: (patch) => set({ story: { ...get().story, ...patch } }),
  setCapabilities: (capabilities) => set({ capabilities }),
  setHudHidden: (hudHidden) => set({ hudHidden }),
  setRecording: (recording) => set({ recording }),
}));
