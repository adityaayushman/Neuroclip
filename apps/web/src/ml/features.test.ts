import { describe, expect, it } from 'vitest';
import { BASE } from '../sim/vitalsModel';
import {
  F,
  FEATURES,
  IS_SUM,
  SAMPLES_PER_STEP,
  WINDOW_STEPS,
  buildSample,
  buildWindow,
  normalizeWindow,
  plattCalibrate,
  sigmoid,
} from './features';

const base = {
  vitals: BASE,
  bleedRate: 0,
  pool: 0,
  retractionLoad: 0,
  clampLoad: 0,
  tool: 'suction' as const,
  target: 'brain' as const,
  fine: false,
  down: false,
  errors: { warning: 0, injury: 0, rupture: 0 },
  switches: 0,
  stepIndex: 0,
  stepOverrun: 0,
};
const at = (name: (typeof FEATURES)[number]) => FEATURES.indexOf(name);

describe('features', () => {
  it('has a stable, duplicate-free schema', () => {
    expect(new Set(FEATURES).size).toBe(F);
    expect(F).toBe(31);
    expect(FEATURES.filter((_, i) => IS_SUM[i])).toEqual(['err_warn', 'err_injury', 'err_rupture', 'switches']);
  });

  it('encodes tool and target one-hot plus scaled context', () => {
    const s = buildSample({
      ...base,
      tool: 'bipolar',
      target: 'sac',
      fine: true,
      down: true,
      bleedRate: 0.012,
      pool: 5,
      errors: { warning: 1, injury: 0, rupture: 2 },
      stepIndex: 4,
    });
    expect(s[at('tool_bipolar')]).toBe(1);
    expect(s[at('tool_suction')]).toBe(0);
    expect(s[at('tgt_sac')]).toBe(1);
    expect(s[at('fine')]).toBe(1);
    expect(s[at('bleed')]).toBeCloseTo(1.2);
    expect(s[at('pool')]).toBeCloseTo(0.5);
    expect(s[at('err_rupture')]).toBe(2);
    expect(s[at('step_frac')]).toBeCloseTo(0.8);
    expect(s[at('hr')]).toBe(BASE.hr);
  });

  it('builds windows with block means, summed counters and early padding', () => {
    const n = SAMPLES_PER_STEP * 5;
    const flat = new Float32Array(n * F);
    for (let i = 0; i < n; i++) {
      flat[i * F + at('hr')] = i;
      flat[i * F + at('err_warn')] = 1;
    }
    const w = buildWindow(flat, n - 1);
    expect(w.length).toBe(WINDOW_STEPS * F);
    const last = (WINDOW_STEPS - 1) * F;
    expect(w[last + at('hr')]).toBeCloseTo(44.5);
    expect(w[last + at('err_warn')]).toBe(SAMPLES_PER_STEP);
    const prevBlock = (WINDOW_STEPS - 2) * F;
    expect(w[prevBlock + at('hr')]).toBeCloseTo(34.5);
    expect(w[0 + at('hr')]).toBeCloseTo(4.5);
    expect(w[0 + at('err_warn')]).toBe(0);
  });

  it('normalizes per feature and calibrates with Platt scaling', () => {
    const w = new Float32Array(WINDOW_STEPS * F).fill(10);
    const mean = new Float32Array(F).fill(4);
    const std = new Float32Array(F).fill(2);
    expect(normalizeWindow(w, mean, std)[F + 3]).toBe(3);
    expect(sigmoid(0)).toBe(0.5);
    expect(plattCalibrate(0, 1, 0)).toBe(0.5);
    expect(plattCalibrate(2, 1, -2)).toBe(0.5);
  });
});
