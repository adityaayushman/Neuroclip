import type { Debrief, LeaderboardEntry, TelemetryEvent } from '@neuroclip/shared';
import { create } from 'zustand';
import { ApiError, getLeaderboard, loadPlayer, saveRun } from '../api/client';
import { telemetry } from '../sim/telemetry';
import { useSession } from './session';

export type RunPhase = 'idle' | 'naming' | 'saving' | 'done' | 'error';

interface RunState {
  phase: RunPhase;
  events: TelemetryEvent[];
  debrief: Debrief | null;
  leaderboard: LeaderboardEntry[];
  error: string | null;
  open: () => void;
  save: (name: string) => Promise<void>;
  close: () => void;
}

const SEED = 1;

export const defaultName = () => loadPlayer()?.display_name ?? '';

export const useRun = create<RunState>((set, get) => ({
  phase: 'idle',
  events: [],
  debrief: null,
  leaderboard: [],
  error: null,
  open: () => set({ phase: 'naming', events: telemetry.snapshot(), error: null, debrief: null }),
  save: async (name) => {
    set({ phase: 'saving', error: null });
    try {
      const { debrief } = await saveRun(name.trim(), useSession.getState().mode, SEED, get().events);
      const lb = await getLeaderboard(debrief.mode).catch(() => null);
      set({ phase: 'done', debrief, leaderboard: lb?.entries ?? [] });
    } catch (e) {
      set({ phase: 'error', error: e instanceof ApiError ? e.message : 'Could not save the run' });
    }
  },
  close: () => set({ phase: 'idle' }),
}));
