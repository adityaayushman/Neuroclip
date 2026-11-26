import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BASE,
  BOUNDS,
  alarmCode,
  bloodLossMl,
  level,
  stepVitals,
  type Anesthesia,
  type Vitals,
  type VitalsInput,
} from './vitalsModel';

const inRange = (v: Vitals) =>
  (Object.keys(BOUNDS) as (keyof typeof BOUNDS)[]).every(
    (k) => Number.isFinite(v[k]) && v[k] >= BOUNDS[k][0] - 1e-9 && v[k] <= BOUNDS[k][1] + 1e-9,
  ) && v.dbp <= v.sbp - 10 + 1e-9;

const input: fc.Arbitrary<VitalsInput> = fc.record({
  bleedRate: fc.double({ min: -1, max: 1, noNaN: true }),
  retractionMs: fc.double({ min: -1e3, max: 1e7, noNaN: true }),
  clampMs: fc.double({ min: -1e3, max: 1e7, noNaN: true }),
  anesthesia: fc.constantFrom<Anesthesia>('stable', 'light', 'deep', 'apnea'),
});
const dt = fc.double({ min: -1, max: 30, noNaN: true });

describe('vitals model properties', () => {
  it('stays finite and within physiological bounds for any inputs and step sizes', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(input, dt), { minLength: 1, maxLength: 60 }), (steps) => {
        let v: Vitals = { ...BASE };
        for (const [i, h] of steps) {
          v = stepVitals(v, i, h);
          if (!inRange(v)) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('survives hostile inputs (NaN, Infinity)', () => {
    const v = stepVitals(BASE, { bleedRate: NaN, retractionMs: Infinity, clampMs: NaN, anesthesia: 'stable' }, NaN);
    expect(inRange(v)).toBe(true);
    const w = stepVitals(BASE, { bleedRate: Infinity, retractionMs: 0, clampMs: 0, anesthesia: 'stable' }, 5);
    expect(inRange(w)).toBe(true);
  });

  it('is step-size consistent: one big step equals many small ones', () => {
    fc.assert(
      fc.property(input, fc.double({ min: 0.1, max: 20, noNaN: true }), (i, total) => {
        const big = stepVitals(BASE, i, total);
        let small = { ...BASE };
        for (let k = 0; k < 10; k++) small = stepVitals(small, i, total / 10);
        return Math.abs(big.sbp - small.sbp) < 1.5 && Math.abs(big.hr - small.hr) < 1.5;
      }),
      { numRuns: 100 },
    );
  });

  it('more bleeding never raises systolic pressure after the same time (monotone)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.02, noNaN: true }),
        fc.double({ min: 0, max: 0.02, noNaN: true }),
        fc.double({ min: 5, max: 90, noNaN: true }),
        (a, b, t) => {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const run = (rate: number) =>
            stepVitals(BASE, { bleedRate: rate, retractionMs: 0, clampMs: 0, anesthesia: 'stable' }, t);
          const [vl, vh] = [run(lo), run(hi)];
          return vh.vol <= vl.vol + 1e-9 && vh.sbp <= vl.sbp + 1e-6;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('vitals model behaviour', () => {
  const calm: VitalsInput = { bleedRate: 0, retractionMs: 0, clampMs: 0, anesthesia: 'stable' };

  it('is at rest with no stimulus', () => {
    const v = stepVitals(BASE, calm, 60);
    expect(v.sbp).toBeCloseTo(BASE.sbp, 0);
    expect(level('hr', v)).toBe('ok');
  });

  it('rupture-rate bleeding drops BP, raises HR, and raises alarms', () => {
    let v = { ...BASE };
    for (let t = 0; t < 50; t++) v = stepVitals(v, { ...calm, bleedRate: 0.007 }, 1);
    expect(v.sbp).toBeLessThan(90);
    expect(v.hr).toBeGreaterThan(95);
    expect(level('sbp', v)).not.toBe('ok');
    expect(alarmCode('sbp', v)).toBe('hypotension');
    expect(bloodLossMl(v)).toBeGreaterThan(1000);
  });

  it('long retraction and clamping raise ICP', () => {
    const v = stepVitals(BASE, { ...calm, retractionMs: 90_000, clampMs: 180_000 }, 60);
    expect(v.icp).toBeGreaterThan(20);
    expect(level('icp', v)).not.toBe('ok');
  });

  it('apnea drops SpO2 and anesthesia depth shifts HR and BP', () => {
    expect(stepVitals(BASE, { ...calm, anesthesia: 'apnea' }, 40).spo2).toBeLessThan(90);
    const light = stepVitals(BASE, { ...calm, anesthesia: 'light' }, 30);
    const deep = stepVitals(BASE, { ...calm, anesthesia: 'deep' }, 30);
    expect(light.sbp).toBeGreaterThan(deep.sbp);
    expect(light.hr).toBeGreaterThan(deep.hr);
  });

  it('recovers toward baseline once bleeding stops', () => {
    let v = { ...BASE };
    for (let t = 0; t < 45; t++) v = stepVitals(v, { ...calm, bleedRate: 0.007 }, 1);
    const low = v.sbp;
    for (let t = 0; t < 120; t++) v = stepVitals(v, calm, 1);
    expect(v.sbp).toBeGreaterThan(low + 15);
    expect(v.vol).toBeGreaterThan(0.75);
  });
});
