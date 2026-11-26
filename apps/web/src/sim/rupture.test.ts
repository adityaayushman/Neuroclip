import type { ToolId } from '@neuroclip/shared';
import { Vector3 } from 'three';
import { createActor } from 'xstate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { surfacePoint } from '../lib/brain';
import { bleedRateOf, poolAround, RUPTURE_RATE, useSim, type V3 } from '../tools/toolSim';
import { simHooks } from './events';
import { RUPTURE_CUE } from './mentor';
import { surgeryMachine } from './surgeryMachine';
import { useVitals } from './vitalsStore';

const sp = surfacePoint(new Vector3(0.5, 0.1, 0.5));
const P: V3 = [sp.x, sp.y, sp.z];
const sim = () => useSim.getState();
const vit = () => useVitals.getState();

function frame(dtMs: number, use?: { tool: ToolId; target: 'brain' | 'vessel' | 'sac'; fine?: boolean; click?: boolean }) {
  if (use) {
    if (sim().activeTool !== use.tool) sim().selectTool(use.tool);
    sim().use({ target: use.target, point: P, fine: use.fine ?? false, dtMs, down: true, click: use.click ?? false });
  }
  sim().tick(dtMs);
  const s = sim();
  vit().step(dtMs / 1000, {
    bleedRate: bleedRateOf(s.bleeder),
    retractionMs: s.retraction.on ? s.retraction.totalMs : 0,
    clampMs: s.clamp.on ? s.clamp.totalMs : 0,
  });
}

let actor: ReturnType<typeof createActor<typeof surgeryMachine>>;

beforeEach(() => {
  actor = createActor(surgeryMachine, { input: { mode: 'guided' } }).start();
  simHooks.onFact = (f) => actor.send(f);
  sim().reset(P, P);
  vit().reset();
});
afterEach(() => {
  simHooks.onFact = undefined;
});

describe('rupture and recovery', () => {
  it('is playable end to end: rupture, BP falls, suction then bipolar, recovery', () => {
    expect(bleedRateOf(sim().bleeder)).toBeLessThan(0.001);
    frame(100, { tool: 'microscissors', target: 'vessel', click: true });
    expect(sim().counters.ruptures).toBe(1);
    expect(sim().bleeder!.rate).toBe(RUPTURE_RATE);
    expect(actor.getSnapshot().context.mentor?.text).toContain(RUPTURE_CUE);

    for (let i = 0; i < 200; i++) frame(100);
    const dropped = vit().v;
    expect(dropped.sbp).toBeLessThan(100);
    expect(dropped.hr).toBeGreaterThan(85);
    expect(poolAround(sim().decals, P)).toBeGreaterThan(8);

    const blindStart = sim().bleeder!.size;
    for (let i = 0; i < 10; i++) frame(100, { tool: 'bipolar', target: 'vessel', fine: true });
    expect(blindStart - sim().bleeder!.size).toBeLessThan(0.3);

    let frames = 0;
    while (sim().bleeder && frames < 1500) {
      const blind = poolAround(sim().decals, P) > 6;
      frame(100, blind ? { tool: 'suction', target: 'brain' } : { tool: 'bipolar', target: 'vessel', fine: true });
      frames++;
    }
    expect(sim().bleeder).toBeNull();
    expect(frames).toBeLessThan(1500);
    const trough = Math.min(vit().v.sbp, dropped.sbp);

    for (let i = 0; i < 1200; i++) frame(100);
    expect(vit().v.sbp).toBeGreaterThan(trough + 12);
    expect(vit().v.vol).toBeGreaterThan(0.7);
    expect(vit().levels.sbp).not.toBe('crit');
    expect(actor.getSnapshot().context.errors.some((e) => e.code === 'vessel_nick')).toBe(true);
  });

  it('left untreated, hypotension raises a vitals alarm that reaches the mentor', () => {
    sim().rupture();
    for (let i = 0; i < 900 && vit().levels.sbp !== 'crit'; i++) frame(100);
    expect(vit().levels.sbp).toBe('crit');
    const codes = actor.getSnapshot().context.errors.map((e) => e.code);
    expect(codes).toContain('alarm_hypotension');
  });

  it('over-retraction causes a slower bleed and raises ICP', () => {
    sim().selectTool('retractor');
    sim().use({ target: 'brain', point: P, fine: false, dtMs: 0, down: true, click: true });
    for (let i = 0; i < 1000 && !sim().bleeder?.rate; i++) frame(100);
    for (let i = 0; i < 960; i++) frame(100);
    expect(sim().counters.ruptures).toBe(0);
    expect(sim().events.some((e) => e.code === 'over_retraction')).toBe(true);
    expect(vit().v.icp).toBeGreaterThan(18);
  });
});
