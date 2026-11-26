import { create } from 'zustand';
import { useSession } from '../state/session';
import { simHooks } from './events';
import {
  BASE,
  alarmCode,
  bloodLossMl,
  level,
  stepVitals,
  type Anesthesia,
  type Level,
  type VitalKey,
  type Vitals,
} from './vitalsModel';

export const HISTORY_LEN = 120;
const SAMPLE_EVERY_S = 0.5;
const KEYS: VitalKey[] = ['hr', 'sbp', 'spo2', 'icp'];

export interface VitalsStepInput {
  bleedRate: number;
  retractionMs: number;
  clampMs: number;
}

interface VitalsState {
  v: Vitals;
  anesthesia: Anesthesia;
  levels: Record<VitalKey, Level>;
  lostMl: number;
  history: Record<VitalKey, number[]>;
  sampleAcc: number;
  step: (dtSec: number, input: VitalsStepInput) => void;
  setAnesthesia: (a: Anesthesia) => void;
  reset: () => void;
}

const freshHistory = (): Record<VitalKey, number[]> => ({ hr: [], sbp: [], spo2: [], icp: [] });
const freshLevels = (): Record<VitalKey, Level> => ({ hr: 'ok', sbp: 'ok', spo2: 'ok', icp: 'ok' });

export const useVitals = create<VitalsState>((set, get) => ({
  v: { ...BASE },
  anesthesia: 'stable',
  levels: freshLevels(),
  lostMl: 0,
  history: freshHistory(),
  sampleAcc: 0,
  step: (dtSec, input) => {
    const s = get();
    const v = stepVitals(s.v, { ...input, anesthesia: s.anesthesia }, dtSec);
    const levels = { ...s.levels };
    for (const k of KEYS) {
      const l = level(k, v);
      if (l === 'crit' && s.levels[k] !== 'crit') simHooks.onFact?.({ type: 'ALARM', code: alarmCode(k, v) });
      levels[k] = l;
    }
    let history = s.history;
    let sampleAcc = s.sampleAcc + dtSec;
    if (sampleAcc >= SAMPLE_EVERY_S) {
      sampleAcc = 0;
      history = Object.fromEntries(KEYS.map((k) => [k, [...s.history[k], v[k]].slice(-HISTORY_LEN)])) as typeof history;
    }
    const sameLevels = KEYS.every((k) => levels[k] === s.levels[k]);
    set({ v, levels: sameLevels ? s.levels : levels, lostMl: bloodLossMl(v), history, sampleAcc });
    const session = useSession.getState();
    if (Math.abs(session.hr - v.hr) >= 0.5) session.setHr(v.hr);
  },
  setAnesthesia: (anesthesia) => set({ anesthesia }),
  reset: () => set({ v: { ...BASE }, levels: freshLevels(), lostMl: 0, history: freshHistory(), sampleAcc: 0 }),
}));
