import { create } from 'zustand';
import { surgery } from '../sim/surgeryStore';
import { SAMPLE_HZ } from './features';
import type { OutMessage } from './protocol';

export const WARMUP_SAMPLES = 20 * SAMPLE_HZ;
const SUSTAIN_SAMPLES = SAMPLE_HZ;
const COOLDOWN_SAMPLES = 20 * SAMPLE_HZ;

type Result = Extract<OutMessage, { type: 'result' }>;

interface MlState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  files: { skill: string; rupture: string } | null;
  alertThreshold: number;
  skill: number | null;
  risk: number | null;
  ms: number | null;
  maxMs: number;
  skillSum: number;
  skillN: number;
  above: number;
  lastAlertN: number;
  setStatus: (s: MlState['status'], error?: string | null) => void;
  setReady: (files: { skill: string; rupture: string }, alertThreshold: number) => void;
  push: (r: Result) => void;
  skillEstimate: () => number | null;
  reset: () => void;
}

const fresh = {
  skill: null,
  risk: null,
  ms: null,
  maxMs: 0,
  skillSum: 0,
  skillN: 0,
  above: 0,
  lastAlertN: -Infinity,
};

export const useMl = create<MlState>((set, get) => ({
  status: 'idle',
  error: null,
  files: null,
  alertThreshold: 0.35,
  ...fresh,
  setStatus: (status, error = null) => set({ status, error }),
  setReady: (files, alertThreshold) => set({ status: 'ready', error: null, files, alertThreshold }),
  push: (r) => {
    const s = get();
    const warm = r.n >= WARMUP_SAMPLES;
    const muted = surgery.getSnapshot().context.step === 'positioning_craniotomy';
    const above = !muted && r.risk >= s.alertThreshold ? s.above + 1 : 0;
    let lastAlertN = s.lastAlertN;
    if (warm && above >= SUSTAIN_SAMPLES && r.n - lastAlertN >= COOLDOWN_SAMPLES) {
      lastAlertN = r.n;
      surgery.send({ type: 'RISK', p: r.risk });
    }
    set({
      skill: r.skill,
      risk: r.risk,
      ms: r.ms,
      maxMs: Math.max(s.maxMs, r.ms),
      skillSum: warm ? s.skillSum + r.skill : s.skillSum,
      skillN: warm ? s.skillN + 1 : s.skillN,
      above,
      lastAlertN,
    });
  },
  skillEstimate: () => {
    const { skillSum, skillN } = get();
    return skillN > 0 ? skillSum / skillN : null;
  },
  reset: () => set({ ...fresh }),
}));
