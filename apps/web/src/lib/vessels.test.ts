import { describe, expect, it } from 'vitest';
import { pulseWave } from './pulse';
import { mulberry32 } from './rng';
import { createVesselTree } from './vessels';

describe('vessels', () => {
  it('is deterministic per seed and varies across seeds', () => {
    const a = createVesselTree(7).geometry.getAttribute('position').array;
    const b = createVesselTree(7).geometry.getAttribute('position').array;
    const c = createVesselTree(8).geometry.getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
  it('builds a tree with an aneurysm sac above the surface', () => {
    const t = createVesselTree(1);
    expect(t.segments).toBeGreaterThan(10);
    expect(t.aneurysm.center.length()).toBeGreaterThan(t.aneurysm.neck.length() * 0.95);
    expect(t.geometry.getAttribute('position').count).toBeGreaterThan(1000);
  });
});

describe('pulseWave', () => {
  it('stays in [0,1] and is periodic', () => {
    for (let p = -2; p < 3; p += 0.013) {
      const v = pulseWave(p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(pulseWave(p + 1)).toBeCloseTo(v, 6);
    }
    expect(pulseWave(0.175)).toBeCloseTo(1, 5);
  });
});

describe('mulberry32', () => {
  it('repeats for the same seed', () => {
    const a = mulberry32(3);
    const b = mulberry32(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
