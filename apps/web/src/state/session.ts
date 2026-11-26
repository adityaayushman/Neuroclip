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
  zoom: number;
  focus: number;
  hr: number;
  fine: boolean;
  debug: boolean;
  speech: boolean;
  stats: Stats;
  setMode: (m: Mode) => void;
  setZoom: (z: number) => void;
  setFocus: (f: number) => void;
  setHr: (hr: number) => void;
  setFine: (f: boolean) => void;
  toggleDebug: () => void;
  setSpeech: (v: boolean) => void;
  setStats: (s: Stats) => void;
}

export const useSession = create<SessionState>((set) => ({
  mode: 'guided',
  zoom: 1,
  focus: 0.43,
  hr: 72,
  fine: false,
  debug: true,
  speech: false,
  stats: { fps: 0, calls: 0, triangles: 0 },
  setMode: (mode) => set({ mode }),
  setZoom: (z) => set({ zoom: clampZoom(z) }),
  setFocus: (f) => set({ focus: clamp(f, 0, 1) }),
  setHr: (hr) => set({ hr: clamp(hr, 30, 200) }),
  setFine: (fine) => set((s) => (s.fine === fine ? s : { fine })),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
  setSpeech: (speech) => set({ speech }),
  setStats: (stats) => set({ stats }),
}));
