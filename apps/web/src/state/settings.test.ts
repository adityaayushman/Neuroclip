import { describe, expect, it } from 'vitest';
import { anatomyFor } from '../lib/anatomy';
import { createVesselTree } from '../lib/vessels';
import { introEnabled } from '../components/Intro';
import { loadSettings, paletteFor } from './settings';

const store = (v: string | null) => ({ getItem: () => v });

describe('settings', () => {
  it('loads defaults, ignores corrupt storage and merges saved values', () => {
    expect(loadSettings(store(null)).skipBlood).toBe(false);
    expect(loadSettings(store('{nope')).intro).toBe(true);
    const s = loadSettings(store('{"skipBlood":true,"colorblind":true,"intro":false,"reducedMotion":true}'));
    expect(s).toEqual({ skipBlood: true, colorblind: true, intro: false, reducedMotion: true });
  });
  it('has a distinct colorblind palette', () => {
    expect(paletteFor(true).blood).not.toBe(paletteFor(false).blood);
  });
  it('skips the intro for reduced motion, the setting, or ?intro=0', () => {
    expect(introEnabled(true, false, '')).toBe(true);
    expect(introEnabled(false, false, '')).toBe(false);
    expect(introEnabled(true, true, '')).toBe(false);
    expect(introEnabled(true, false, '?intro=0')).toBe(false);
  });
});

describe('anatomy variants', () => {
  it('maps seeds to three variants, with seed 1 as the standard anatomy', () => {
    expect(anatomyFor(1).id).toBe(0);
    expect(anatomyFor(2).id).toBe(1);
    expect(anatomyFor(3).id).toBe(2);
    expect(anatomyFor(4).id).toBe(0);
  });
  it('builds a different aneurysm per variant', () => {
    const [a, b, c] = [1, 2, 3].map((s) => createVesselTree(s).aneurysm);
    expect(new Set([a!.radius, b!.radius, c!.radius]).size).toBe(3);
    expect(a!.center.distanceTo(b!.center)).toBeGreaterThan(0.01);
  });
});
