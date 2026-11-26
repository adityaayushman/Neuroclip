import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolId } from '@neuroclip/shared';
import { Vector3 } from 'three';
import { surfacePoint } from '../lib/brain';
import { useSim, type UseInput, type V3 } from './toolSim';

const sp = surfacePoint(new Vector3(0.5, 0, 0.5));
const P: V3 = [sp.x, sp.y, sp.z];
const sim = () => useSim.getState();
const use = (target: UseInput['target'], o: Partial<UseInput> = {}) =>
  sim().use({ target, point: P, fine: false, dtMs: 100, down: true, click: false, ...o });
const select = (id: ToolId) => sim().selectTool(id);

beforeEach(() => {
  sim().reset(P);
});

describe('tool effects', () => {
  it('suction clears blood decals', () => {
    const n = sim().decals.length;
    expect(n).toBeGreaterThan(0);
    select('suction');
    const point = sim().decals[0]!.pos;
    for (let i = 0; i < 40; i++) use('brain', { point });
    expect(sim().decals.length).toBeLessThan(n);
  });

  it('cottonoid absorbs ooze more slowly than suction', () => {
    select('cottonoid');
    const point = sim().decals[0]!.pos;
    for (let i = 0; i < 5; i++) use('brain', { point, dtMs: 100 });
    const cot = sim().decals.reduce((s, d) => s + d.a, 0);
    sim().reset(P);
    select('suction');
    for (let i = 0; i < 5; i++) use('brain', { point, dtMs: 100 });
    const suc = sim().decals.reduce((s, d) => s + d.a, 0);
    expect(cot).toBeGreaterThan(suc);
  });

  it('bipolar shrinks then removes the bleeder', () => {
    select('bipolar');
    use('vessel', { fine: true, dtMs: 500 });
    expect(sim().bleeder!.size).toBeLessThan(1);
    for (let i = 0; i < 10; i++) use('vessel', { fine: true, dtMs: 500 });
    expect(sim().bleeder).toBeNull();
    expect(sim().events.some((e) => e.code === 'hemostasis')).toBe(true);
  });

  it('ooze keeps spawning while bleeder is active and stops after hemostasis', () => {
    const before = sim().decals.length;
    for (let i = 0; i < 100; i++) sim().tick(100);
    expect(sim().decals.length).toBeGreaterThan(before);
    sim().reset(P);
    select('bipolar');
    for (let i = 0; i < 10; i++) use('vessel', { fine: true, dtMs: 500 });
    const n = sim().decals.length;
    for (let i = 0; i < 100; i++) sim().tick(100);
    expect(sim().decals.length).toBe(n);
  });

  it('retractor toggles and its injury timer triggers over_retraction', () => {
    select('retractor');
    use('brain', { click: true, down: true, dtMs: 0 });
    expect(sim().retraction.on).toBe(true);
    for (let i = 0; i < 950; i++) sim().tick(100);
    expect(sim().events.some((e) => e.code === 'over_retraction')).toBe(true);
    use('brain', { click: true, down: true, dtMs: 0 });
    expect(sim().retraction.on).toBe(false);
  });

  it('temporary clip toggles on vessels only and times out', () => {
    select('temporary_clip');
    use('brain', { click: true, dtMs: 0 });
    expect(sim().clamp.on).toBe(false);
    expect(sim().events.some((e) => e.code === 'temp_clip_misplaced')).toBe(true);
    use('vessel', { click: true, dtMs: 0 });
    expect(sim().clamp.on).toBe(true);
    for (let i = 0; i < 1900; i++) sim().tick(100);
    expect(sim().events.some((e) => e.code === 'prolonged_clamp')).toBe(true);
  });

  it('doppler reports flow, clamped and none', () => {
    select('doppler');
    use('vessel', { down: false });
    expect(sim().doppler).toBe('flow');
    use('brain', { down: false });
    expect(sim().doppler).toBe('none');
    select('temporary_clip');
    use('vessel', { click: true, dtMs: 0 });
    select('doppler');
    use('sac', { down: false });
    expect(sim().doppler).toBe('clamped');
  });

  it('clip applier records clips on the sac', () => {
    select('clip_applier');
    use('sac', { click: true, fine: true, dtMs: 0 });
    expect(sim().clips).toHaveLength(1);
  });

  it('throttles repeated failure events', () => {
    select('suction');
    for (let i = 0; i < 10; i++) use('vessel', { dtMs: 50 });
    expect(sim().events.filter((e) => e.code === 'suction_tissue_damage')).toHaveLength(1);
  });

  it('hold tools do nothing when the button is up', () => {
    select('suction');
    const n = sim().decals.length;
    use('brain', { down: false, fine: true });
    expect(sim().decals.length).toBe(n);
  });

  it('switches tools well under 50 ms', () => {
    const ids: ToolId[] = ['suction', 'bipolar', 'doppler', 'retractor'];
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const t0 = performance.now();
      select(ids[i % ids.length]!);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(50);
  });
});
