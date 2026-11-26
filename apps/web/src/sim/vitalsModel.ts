import { CLAMP_LIMIT_MS, RETRACTION_LIMIT_MS } from '../tools/toolDefs';

export type Anesthesia = 'stable' | 'light' | 'deep' | 'apnea';
export type VitalKey = 'hr' | 'sbp' | 'spo2' | 'icp';
export type Level = 'ok' | 'warn' | 'crit';

export interface Vitals {
  hr: number;
  sbp: number;
  dbp: number;
  spo2: number;
  icp: number;
  vol: number;
}

export interface VitalsInput {
  bleedRate: number;
  retractionMs: number;
  clampMs: number;
  anesthesia: Anesthesia;
}

export const BASE: Vitals = { hr: 72, sbp: 118, dbp: 72, spo2: 99, icp: 10, vol: 1 };
export const BOUNDS = {
  hr: [20, 220],
  sbp: [30, 260],
  dbp: [15, 160],
  spo2: [40, 100],
  icp: [0, 80],
  vol: [0.2, 1],
} as const;
export const BLOOD_VOLUME_ML = 5000;
export const MAX_BLEED_RATE = 0.05;

const TAU = { hr: 3, bp: 3, spo2: 6, icp: 8 };
const RECOVERY_RATE = 0.002;
const RECOVERY_CEILING = 0.95;
const MAX_STEP_S = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const relax = (x: number, target: number, tau: number, h: number) => x + (target - x) * (1 - Math.exp(-h / tau));

function targets(v: Vitals, i: VitalsInput) {
  const deficit = clamp((1 - v.vol) / 0.5, 0, 1);
  const shock = deficit ** 1.3;
  let sbp = BASE.sbp * (1 - 0.65 * shock);
  let dbp = BASE.dbp * (1 - 0.55 * shock);
  let hr = BASE.hr * (1 + (0.9 * Math.min(deficit, 0.6)) / 0.6);
  if (deficit > 0.7) hr += (45 - hr) * ((deficit - 0.7) / 0.3);

  const retraction = clamp(i.retractionMs / RETRACTION_LIMIT_MS, 0, 1.5);
  const clampLoad = clamp(i.clampMs / CLAMP_LIMIT_MS, 0, 1.5);
  const icp = BASE.icp + 9 * retraction + 7 * clampLoad + Math.min(20, i.bleedRate * 2500);

  if (v.icp > 25) {
    sbp += (v.icp - 25) * 2.5;
    hr -= (v.icp - 25) * 1.2;
  }
  let spo2 = 99 - 45 * deficit ** 2;
  if (i.anesthesia === 'light') {
    hr += 25;
    sbp += 30;
    dbp += 15;
  } else if (i.anesthesia === 'deep') {
    hr -= 15;
    sbp -= 30;
    dbp -= 18;
  } else if (i.anesthesia === 'apnea') {
    spo2 = 45;
  }
  return { hr, sbp, dbp, spo2, icp };
}

export function stepVitals(v: Vitals, input: VitalsInput, dtSec: number): Vitals {
  let s = { ...v };
  const bleed = clamp(num(input.bleedRate), 0, MAX_BLEED_RATE);
  const i: VitalsInput = {
    bleedRate: bleed,
    retractionMs: Math.max(0, num(input.retractionMs)),
    clampMs: Math.max(0, num(input.clampMs)),
    anesthesia: input.anesthesia,
  };
  let remaining = Math.max(0, num(dtSec));
  while (remaining > 1e-9) {
    const h = Math.min(remaining, MAX_STEP_S);
    remaining -= h;
    const recovery = bleed < 1e-4 && s.vol < RECOVERY_CEILING ? RECOVERY_RATE : 0;
    s.vol = clamp(s.vol - bleed * h + recovery * h, BOUNDS.vol[0], BOUNDS.vol[1]);
    const t = targets(s, i);
    s = {
      vol: s.vol,
      hr: clamp(relax(s.hr, t.hr, TAU.hr, h), ...BOUNDS.hr),
      sbp: clamp(relax(s.sbp, t.sbp, TAU.bp, h), ...BOUNDS.sbp),
      dbp: clamp(relax(s.dbp, t.dbp, TAU.bp, h), ...BOUNDS.dbp),
      spo2: clamp(relax(s.spo2, t.spo2, i.anesthesia === 'apnea' ? 12 : TAU.spo2, h), ...BOUNDS.spo2),
      icp: clamp(relax(s.icp, t.icp, TAU.icp, h), ...BOUNDS.icp),
    };
    s.dbp = clamp(Math.min(s.dbp, s.sbp - 10), BOUNDS.dbp[0], BOUNDS.dbp[1]);
  }
  return s;
}

export const map = (v: Vitals) => v.dbp + (v.sbp - v.dbp) / 3;
export const bloodLossMl = (v: Vitals) => Math.round((1 - v.vol) * BLOOD_VOLUME_ML);

export function level(key: VitalKey, v: Vitals): Level {
  switch (key) {
    case 'hr':
      return v.hr < 40 || v.hr > 140 ? 'crit' : v.hr < 50 || v.hr > 110 ? 'warn' : 'ok';
    case 'sbp':
      return v.sbp < 70 || v.sbp > 200 ? 'crit' : v.sbp < 90 || v.sbp > 160 ? 'warn' : 'ok';
    case 'spo2':
      return v.spo2 < 90 ? 'crit' : v.spo2 < 95 ? 'warn' : 'ok';
    case 'icp':
      return v.icp > 30 ? 'crit' : v.icp > 20 ? 'warn' : 'ok';
  }
}

export function alarmCode(key: VitalKey, v: Vitals): string {
  switch (key) {
    case 'hr':
      return v.hr < BASE.hr ? 'bradycardia' : 'tachycardia';
    case 'sbp':
      return v.sbp < BASE.sbp ? 'hypotension' : 'hypertension';
    case 'spo2':
      return 'hypoxia';
    case 'icp':
      return 'icp_high';
  }
}
