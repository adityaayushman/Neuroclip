import { STEPS } from '@neuroclip/shared';
import { Vector3 } from 'three';
import { createActor } from 'xstate';
import { surfacePoint } from '../../lib/brain';
import { mulberry32 } from '../../lib/rng';
import { createVesselTree } from '../../lib/vessels';
import { ptr } from '../../scene/pointerState';
import { simHooks, type SimFact } from '../../sim/events';
import { surgeryMachine } from '../../sim/surgeryMachine';
import { bloodLossMl } from '../../sim/vitalsModel';
import { useVitals } from '../../sim/vitalsStore';
import { useSession } from '../../state/session';
import type { TargetKind } from '../../tools/toolDefs';
import { bleedRateOf, poolAround, RUPTURE_RATE, useSim, type V3 } from '../../tools/toolSim';
import { buildWindow, F, SAMPLE_HZ, SAMPLES_PER_STEP, WINDOW_STEPS } from '../features';
import { Sampler } from '../sampler';
import { paramsFor, script, type AgentView, type AgentWorld, type Prim } from './agent';

const DT_MS = 1000 / SAMPLE_HZ;
const MAX_TICKS = 9000;
const FATAL_TICKS = 300;
const TAIL_TICKS = 30;
export const HORIZON_TICKS = 100;

const tree = createVesselTree(1);
const asV3 = (v: Vector3): V3 => [v.x, v.y, v.z];
const brainPoint = surfacePoint(new Vector3(0.3, 0.45, 0.8));
export const POINTS = {
  brain: asV3(brainPoint),
  vessel: asV3(tree.midpoints[0]!),
  sac: asV3(tree.aneurysm.center),
};
const BLEEDER_POS = asV3(tree.midpoints[1]!);

export interface UserProfile {
  id: number;
  skill: number;
  speed: number;
}

export interface Episode {
  samples: Float32Array;
  ticks: number;
  stepIdx: Uint8Array;
  ruptureTicks: number[];
  activeBleed: Uint8Array;
  summary: {
    skill: number;
    stepsCompleted: number;
    ruptures: number;
    durationS: number;
    bloodMl: number;
    died: boolean;
  };
  debug: { step: string; progress: Record<string, number>; world: { retractorOn: boolean; clampOn: boolean } };
}

export function simulateEpisode(
  user: UserProfile,
  runSkill: number,
  seed: number,
  trace?: (tick: number, f: SimFact) => void,
): Episode {
  const rand = mulberry32(seed);
  const params = paramsFor(runSkill, user.speed);
  const actor = createActor(surgeryMachine, { input: { mode: 'guided' } }).start();
  const sampler = new Sampler();
  let t = 0;
  simHooks.onFact = (f) => {
    actor.send(f);
    sampler.noteFact(f);
    trace?.(t, f);
  };

  const sim = useSim.getState();
  sim.reset(BLEEDER_POS, POINTS.sac);
  sim.selectTool('suction');
  useVitals.getState().reset();
  useSession.setState({ fine: false });
  ptr.visible = false;
  ptr.down = false;
  ptr.target = 'none';

  const view = (): AgentView => {
    const s = useSim.getState();
    return {
      step: actor.getSnapshot().context.step,
      progress: actor.getSnapshot().context.progress,
      activeTool: s.activeTool,
      bleeder: s.bleeder,
      decals: s.decals,
      retractionOn: s.retraction.on,
      pool: s.bleeder ? poolAround(s.decals, s.bleeder.pos) : 0,
    };
  };
  const world: AgentWorld = { points: POINTS, view };
  const gen = script(params, rand, world);

  const samples = new Float32Array(MAX_TICKS * F);
  const stepIdx = new Uint8Array(MAX_TICKS);
  const activeBleed = new Uint8Array(MAX_TICKS);
  const ruptureTicks: number[] = [];

  const cur: { prim: Prim | null; ticksLeft: number } = { prim: null, ticksLeft: 0 };
  let point: V3 = POINTS.brain;
  let scriptDone = false;
  let tail = 0;
  let machineAcc = 0;
  let lowBp = 0;
  let died = false;
  let lastRuptures = 0;

  const startPrim = (p: Prim) => {
    cur.prim = p;
    switch (p.t) {
      case 'wait':
        cur.ticksLeft = Math.max(1, Math.round(p.ms / DT_MS));
        ptr.down = false;
        break;
      case 'tool':
      case 'confirm':
        cur.ticksLeft = 1;
        ptr.down = false;
        break;
      case 'hold':
      case 'hover':
        cur.ticksLeft = Math.max(1, Math.round(p.ms / DT_MS));
        ptr.visible = true;
        ptr.target = p.target;
        ptr.down = p.t === 'hold';
        point = p.point;
        if (p.t === 'hold') useSession.setState({ fine: p.fine });
        break;
      case 'click':
        cur.ticksLeft = 1;
        ptr.visible = true;
        ptr.target = p.target;
        ptr.down = true;
        point = p.point;
        useSession.setState({ fine: p.fine });
        break;
    }
  };

  for (; t < MAX_TICKS; t++) {
    if (!cur.prim && !scriptDone) {
      const next = gen.next();
      if (next.done) scriptDone = true;
      else startPrim(next.value);
    }

    let click = false;
    if (cur.prim) {
      if (cur.prim.t === 'tool') useSim.getState().selectTool(cur.prim.id);
      else if (cur.prim.t === 'confirm') actor.send({ type: 'CONFIRM', itemId: cur.prim.itemId });
      else if (cur.prim.t === 'click') click = true;
    }
    const target: TargetKind = ptr.visible ? ptr.target : 'none';
    useSim.getState().use({ target, point, fine: useSession.getState().fine, dtMs: DT_MS, down: ptr.down, click });
    useSim.getState().tick(DT_MS);
    const s = useSim.getState();
    useVitals.getState().step(DT_MS / 1000, {
      bleedRate: bleedRateOf(s.bleeder),
      retractionMs: s.retraction.on ? s.retraction.totalMs : 0,
      clampMs: s.clamp.on ? s.clamp.totalMs : 0,
    });
    machineAcc += DT_MS;
    if (machineAcc >= 250) {
      actor.send({ type: 'TICK', dtMs: machineAcc });
      machineAcc = 0;
    }

    const ctx = actor.getSnapshot().context;
    sampler.sample(ctx.step, ctx.stepElapsedMs, samples, t * F);
    stepIdx[t] = STEPS.indexOf(ctx.step);
    activeBleed[t] = s.bleeder && s.bleeder.rate * s.bleeder.size >= RUPTURE_RATE * 0.5 ? 1 : 0;
    if (s.counters.ruptures > lastRuptures) {
      for (let k = lastRuptures; k < s.counters.ruptures; k++) ruptureTicks.push(t);
      lastRuptures = s.counters.ruptures;
    }

    if (cur.prim) {
      cur.ticksLeft -= 1;
      if (cur.ticksLeft <= 0) {
        if (cur.prim.t === 'hold' || cur.prim.t === 'click') ptr.down = false;
        cur.prim = null;
      }
    }
    lowBp = useVitals.getState().v.sbp < 35 ? lowBp + 1 : 0;
    if (lowBp > FATAL_TICKS) {
      died = true;
      t++;
      break;
    }
    if (actor.getSnapshot().matches('done')) {
      tail += 1;
      if (tail > TAIL_TICKS) {
        t++;
        break;
      }
    }
  }

  const finalCtx = actor.getSnapshot().context;
  const done = actor.getSnapshot().matches('done');
  const v = useVitals.getState().v;
  simHooks.onFact = undefined;
  actor.stop();
  return {
    debug: { step: finalCtx.step, progress: finalCtx.progress, world: finalCtx.world },
    samples: samples.subarray(0, t * F),
    ticks: t,
    stepIdx: stepIdx.subarray(0, t),
    ruptureTicks,
    activeBleed: activeBleed.subarray(0, t),
    summary: {
      skill: runSkill,
      stepsCompleted: done ? STEPS.length : STEPS.indexOf(finalCtx.step),
      ruptures: ruptureTicks.length,
      durationS: Math.round(t / SAMPLE_HZ),
      bloodMl: bloodLossMl(v),
      died,
    },
  };
}

export interface WindowSample {
  window: Float32Array;
  end: number;
  step: number;
  ruptureWithin: boolean;
  biased: boolean;
}

/** Samples `count` windows per episode, biasing one toward the lead-up of a rupture when there is one. */
export function sampleWindows(ep: Episode, rand: () => number, count: number): WindowSample[] {
  const minEnd = SAMPLES_PER_STEP * 10;
  if (ep.ticks <= minEnd + 1) return [];
  const out: WindowSample[] = [];
  const tries = count * 6;
  for (let a = 0; a < tries && out.length < count; a++) {
    let end: number;
    let biased = false;
    const firstRupture = ep.ruptureTicks[0];
    const leadLo = firstRupture === undefined ? Infinity : Math.max(minEnd, firstRupture - (HORIZON_TICKS - 5));
    if (out.length === 0 && firstRupture !== undefined && leadLo < firstRupture - 1) {
      biased = true;
      end = leadLo + Math.floor(rand() * (firstRupture - 1 - leadLo + 1));
    } else {
      end = minEnd + Math.floor(rand() * (ep.ticks - minEnd - 1));
    }
    if (ep.activeBleed[end]) continue;
    const ruptureWithin = ep.ruptureTicks.some((r) => r > end && r <= end + HORIZON_TICKS);
    out.push({ window: buildWindow(ep.samples, end), end, step: ep.stepIdx[end]!, ruptureWithin, biased });
  }
  return out;
}

export { WINDOW_STEPS };
