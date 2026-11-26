import { describe, expect, it } from 'vitest';
import { F, WINDOW_STEPS } from '../features';
import { paramsFor } from './agent';
import { sampleWindows, simulateEpisode } from './harness';
import { mulberry32 } from '../../lib/rng';

const T = 120_000;

describe('headless agents', () => {
  it('params get cleaner and faster as skill rises', () => {
    const lo = paramsFor(0.1, 1);
    const hi = paramsFor(0.95, 1);
    expect(hi.err).toBeLessThan(lo.err);
    expect(hi.latency).toBeLessThan(lo.latency);
    expect(hi.pFine).toBeGreaterThan(lo.pFine);
    expect(hi.reactMs).toBeLessThan(lo.reactMs);
  });

  it('an expert completes all six steps cleanly and quickly', { timeout: T }, () => {
    const ep = simulateEpisode({ id: 0, skill: 0.97, speed: 1 }, 0.97, 11);
    expect(ep.summary.stepsCompleted).toBe(6);
    expect(ep.summary.died).toBe(false);
    expect(ep.samples.length).toBe(ep.ticks * F);
    expect(ep.summary.durationS).toBeLessThan(400);
  });

  it('is deterministic for a given seed', { timeout: T }, () => {
    const a = simulateEpisode({ id: 1, skill: 0.5, speed: 1 }, 0.5, 5);
    const b = simulateEpisode({ id: 1, skill: 0.5, speed: 1 }, 0.5, 5);
    expect(b.ticks).toBe(a.ticks);
    expect(Array.from(b.samples.slice(0, 600))).toEqual(Array.from(a.samples.slice(0, 600)));
  });

  it('novices make more mistakes and take longer than experts on average', { timeout: T }, () => {
    const avg = (skill: number) => {
      let rupt = 0;
      let dur = 0;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const ep = simulateEpisode({ id: 2, skill, speed: 1 }, skill, 100 + i);
        rupt += ep.summary.ruptures;
        dur += ep.summary.durationS;
      }
      return { rupt: rupt / n, dur: dur / n };
    };
    const novice = avg(0.1);
    const expert = avg(0.95);
    expect(novice.rupt).toBeGreaterThan(expert.rupt);
    expect(novice.dur).toBeGreaterThan(expert.dur);
  });

  it('rupture lead-up windows are genuinely positive and never clamped to the run start', { timeout: T }, () => {
    let biasedSeen = 0;
    for (let i = 0; i < 8; i++) {
      const ep = simulateEpisode({ id: 4, skill: 0.1, speed: 1 }, 0.1, 300 + i);
      for (const w of sampleWindows(ep, mulberry32(i), 3)) {
        if (!w.biased) continue;
        biasedSeen += 1;
        expect(w.ruptureWithin).toBe(true);
        expect(w.end).toBeLessThan(ep.ruptureTicks[0]!);
      }
    }
    expect(biasedSeen).toBeGreaterThan(0);
  });

  it('samples labelled windows and excludes active-bleed ends', { timeout: T }, () => {
    const ep = simulateEpisode({ id: 3, skill: 0.1, speed: 1 }, 0.1, 21);
    const rand = mulberry32(3);
    const ws = sampleWindows(ep, rand, 3);
    expect(ws.length).toBeGreaterThan(0);
    for (const w of ws) {
      expect(w.window.length).toBe(WINDOW_STEPS * F);
      expect(ep.activeBleed[w.end]).toBe(0);
    }
  });
});
