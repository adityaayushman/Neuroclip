import { TOOLS, type Step, type ToolId } from '@neuroclip/shared';
import type { Vitals } from '../sim/vitalsModel';
import type { TargetKind } from '../tools/toolDefs';

export const WINDOW_STEPS = 48;
export const SAMPLES_PER_STEP = 10;
export const SAMPLE_HZ = 10;
export const TARGETS = ['brain', 'vessel', 'sac', 'none'] as const;

export const FEATURES = [
  'hr',
  'sbp',
  'spo2',
  'icp',
  'vol',
  'bleed',
  'pool',
  'retract_load',
  'clamp_load',
  ...TOOLS.map((t) => `tool_${t}`),
  ...TARGETS.map((t) => `tgt_${t}`),
  'fine',
  'down',
  'err_warn',
  'err_injury',
  'err_rupture',
  'step_frac',
  'step_overrun',
  'switches',
] as const;

export const F = FEATURES.length;
const SUMMED = new Set<string>(['err_warn', 'err_injury', 'err_rupture', 'switches']);
export const IS_SUM = FEATURES.map((f) => SUMMED.has(f));
const IDX = Object.fromEntries(FEATURES.map((f, i) => [f, i])) as Record<(typeof FEATURES)[number], number>;

export interface SampleInput {
  vitals: Vitals;
  bleedRate: number;
  pool: number;
  retractionLoad: number;
  clampLoad: number;
  tool: ToolId;
  target: TargetKind;
  fine: boolean;
  down: boolean;
  errors: { warning: number; injury: number; rupture: number };
  switches: number;
  stepIndex: number;
  stepOverrun: number;
}

export function buildSample(i: SampleInput, out: Float32Array = new Float32Array(F), offset = 0): Float32Array {
  out.fill(0, offset, offset + F);
  const set = (name: (typeof FEATURES)[number], v: number) => {
    out[offset + IDX[name]!] = v;
  };
  set('hr', i.vitals.hr);
  set('sbp', i.vitals.sbp);
  set('spo2', i.vitals.spo2);
  set('icp', i.vitals.icp);
  set('vol', i.vitals.vol);
  set('bleed', i.bleedRate * 100);
  set('pool', i.pool / 10);
  set('retract_load', Math.min(2, i.retractionLoad));
  set('clamp_load', Math.min(2, i.clampLoad));
  set(`tool_${i.tool}` as (typeof FEATURES)[number], 1);
  set(`tgt_${i.target}` as (typeof FEATURES)[number], 1);
  set('fine', i.fine ? 1 : 0);
  set('down', i.down ? 1 : 0);
  set('err_warn', i.errors.warning);
  set('err_injury', i.errors.injury);
  set('err_rupture', i.errors.rupture);
  set('step_frac', i.stepIndex / 5);
  set('step_overrun', Math.min(3, i.stepOverrun));
  set('switches', i.switches);
  return out;
}

export const stepIndexOf = (step: Step, steps: readonly Step[]) => Math.max(0, steps.indexOf(step));

/**
 * Aggregates the last WINDOW_STEPS one-second blocks ending at sample `endIdx`
 * from a flat buffer of 10 Hz samples ([n * F]). Continuous features are averaged,
 * counted features are summed. Missing history repeats the earliest block.
 */
export function buildWindow(flat: Float32Array, endIdx: number, out = new Float32Array(WINDOW_STEPS * F)): Float32Array {
  for (let k = 0; k < WINDOW_STEPS; k++) {
    const blockEnd = endIdx - (WINDOW_STEPS - 1 - k) * SAMPLES_PER_STEP;
    const padded = blockEnd < 0;
    const hi = padded ? Math.min(SAMPLES_PER_STEP - 1, endIdx) : blockEnd;
    const lo = Math.max(0, hi - SAMPLES_PER_STEP + 1);
    const n = hi - lo + 1;
    for (let f = 0; f < F; f++) {
      let acc = 0;
      for (let s = lo; s <= hi; s++) acc += flat[s * F + f]!;
      out[k * F + f] = IS_SUM[f] ? (padded ? 0 : acc) : acc / n;
    }
  }
  return out;
}

export function normalizeWindow(w: Float32Array, mean: ArrayLike<number>, std: ArrayLike<number>): Float32Array {
  const out = new Float32Array(w.length);
  for (let i = 0; i < w.length; i++) {
    const f = i % F;
    out[i] = (w[i]! - mean[f]!) / (std[f]! || 1);
  }
  return out;
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const plattCalibrate = (logit: number, a: number, b: number) => sigmoid(a * logit + b);
