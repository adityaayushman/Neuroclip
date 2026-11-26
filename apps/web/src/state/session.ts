import { create } from 'zustand';
import type { Mode } from '@neuroclip/shared';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampZoom = (z: number) => clamp(z, ZOOM_MIN, ZOOM_MAX);

export interface Stats {
  fps: number;
  calls: number;
  triangles: number;
}

interface SessionState {
  mode: Mode;
  seed: number;
  runId: number;
  zoom: number;
  focus: number;
  hr: number;
  fine: boolean;
  debug: boolean;
  speech: boolean;
  audio: boolean;
  stats: Stats;
  setMode: (m: Mode) => void;
  setSeed: (seed: number) => void;
  bumpRun: () => void;
  setZoom: (z: number) => void;
  setFocus: (f: number) => void;
  setHr: (hr: number) => void;
  setFine: (f: boolean) => void;
  toggleDebug: () => void;
  setSpeech: (v: boolean) => void;
  setAudio: (v: boolean) => void;
  setStats: (s: Stats) => void;
}

export const useSession = create<SessionState>((set) => ({
  mode: 'guided',
  seed: 1,
  runId: 0,
  zoom: 1,
  focus: 0.43,
  hr: 72,
  fine: false,
  debug: true,
  speech: false,
  audio: false,
  stats: { fps: 0, calls: 0, triangles: 0 },
  setMode: (mode) => set({ mode }),
  setSeed: (seed) => set({ seed: Math.max(1, Math.floor(seed)) }),
  bumpRun: () => set((s) => ({ runId: s.runId + 1 })),
  setZoom: (z) => set({ zoom: clampZoom(z) }),
  setFocus: (f) => set({ focus: clamp(f, 0, 1) }),
  setHr: (hr) => set({ hr: clamp(hr, 30, 200) }),
  setFine: (fine) => set((s) => (s.fine === fine ? s : { fine })),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
  setSpeech: (speech) => set({ speech }),
  setAudio: (audio) => set({ audio }),
  setStats: (stats) => set({ stats }),
}));
