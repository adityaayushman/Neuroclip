import { create } from 'zustand';
import type { Mode } from '@neuroclip/shared';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

interface SessionState {
  mode: Mode;
  zoom: number;
  focus: number;
  setMode: (m: Mode) => void;
  setZoom: (z: number) => void;
  setFocus: (f: number) => void;
}

export const useSession = create<SessionState>((set) => ({
  mode: 'guided',
  zoom: 1,
  focus: 0.5,
  setMode: (mode) => set({ mode }),
  setZoom: (z) => set({ zoom: clampZoom(z) }),
  setFocus: (f) => set({ focus: Math.min(1, Math.max(0, f)) }),
}));
