import { create } from 'zustand';
import { Vector3 } from 'three';
import type { ToolId } from '@neuroclip/shared';
import { surfacePoint } from '../lib/brain';
import { mulberry32 } from '../lib/rng';
import { simHooks, type FactName } from '../sim/events';
import { TOOL_DEFS, type Failure, type TargetKind, type UseContext } from './toolDefs';

export type V3 = [number, number, number];
export interface Decal {
  id: number;
  pos: V3;
  r: number;
  a: number;
}
export interface SimEvent extends Failure {
  id: number;
  t: number;
  tool: ToolId;
}
export type DopplerState = 'none' | 'flow' | 'clamped';

export interface UseInput {
  target: TargetKind;
  point: V3;
  fine: boolean;
  dtMs: number;
  down: boolean;
  click: boolean;
}

export const OOZE_RATE = 0.0006;
export const RUPTURE_RATE = 0.012;
const RETRACTION_BLEED_RATE = 0.002;
const BLIND_POOL = 8;
const POOL_RADIUS = 0.15;
const MAX_DECALS = 24;
const EVENT_THROTTLE_MS = 1500;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let rand = mulberry32(1);

export interface Bleeder {
  pos: V3;
  size: number;
  rate: number;
}

const merge = (old: Bleeder | null, nu: Bleeder): Bleeder =>
  old ? { pos: nu.rate >= old.rate ? nu.pos : old.pos, size: Math.max(old.size, nu.size), rate: Math.max(old.rate, nu.rate) } : nu;

export const bleedRateOf = (b: Bleeder | null) => (b ? b.rate * b.size : 0);
export const poolAround = (decals: Decal[], pos: V3) =>
  decals.reduce((sum, d) => (dist(d.pos, pos) < POOL_RADIUS ? sum + d.a : sum), 0);

interface SimState {
  activeTool: ToolId;
  clock: number;
  decals: Decal[];
  bleeder: Bleeder | null;
  sacPos: V3 | null;
  oozeAcc: number;
  retraction: { on: boolean; totalMs: number; center: V3 };
  clamp: { on: boolean; totalMs: number; pos: V3 };
  clips: V3[];
  events: SimEvent[];
  lastFail: Record<string, number>;
  doppler: DopplerState;
  counters: { cuts: number; dissections: number; irrigations: number; ruptures: number };
  heldMs: number;
  lastTarget: TargetKind;
  nextId: number;
  selectTool: (id: ToolId) => void;
  reset: (bleederPos?: V3, sacPos?: V3) => void;
  rupture: (point?: V3) => void;
  use: (i: UseInput) => void;
  tick: (dtMs: number) => void;
}

const initial = () => ({
  clock: 0,
  decals: [] as Decal[],
  bleeder: null as SimState['bleeder'],
  sacPos: null as V3 | null,
  oozeAcc: 0,
  retraction: { on: false, totalMs: 0, center: [0, 0, 0] as V3 },
  clamp: { on: false, totalMs: 0, pos: [0, 0, 0] as V3 },
  clips: [] as V3[],
  events: [] as SimEvent[],
  lastFail: {} as Record<string, number>,
  doppler: 'none' as DopplerState,
  counters: { cuts: 0, dissections: 0, irrigations: 0, ruptures: 0 },
  heldMs: 0,
  lastTarget: 'none' as TargetKind,
  nextId: 1,
});

function spawnDecal(around: V3, id: number): Decal {
  const d = new Vector3(...around).add(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.25));
  const p = surfacePoint(d);
  return { id, pos: [p.x, p.y, p.z], r: 0.03 + rand() * 0.04, a: 1 };
}

export const useSim = create<SimState>((set, get) => {
  const emit = (s: SimState, tool: ToolId, f: Failure, n: Partial<SimState>) => {
    const last = (n.lastFail ?? s.lastFail)[f.code] ?? -Infinity;
    if (s.clock - last < EVENT_THROTTLE_MS) return false;
    const nextId = n.nextId ?? s.nextId;
    n.events = [...(n.events ?? s.events), { ...f, id: nextId, t: s.clock, tool }].slice(-30);
    n.lastFail = { ...(n.lastFail ?? s.lastFail), [f.code]: s.clock };
    n.nextId = nextId + 1;
    if (f.severity !== 'info') simHooks.onFact?.({ type: 'FAILURE', tool, code: f.code, severity: f.severity });
    return true;
  };
  const fact = (fact: FactName) => simHooks.onFact?.({ type: 'FACT', fact });

  return {
    activeTool: 'suction',
    ...initial(),
    selectTool: (activeTool) => set({ activeTool, heldMs: 0 }),
    reset: (bleederPos, sacPos) => {
      rand = mulberry32(1);
      const s = get();
      const next: Partial<SimState> = { ...initial() };
      if (bleederPos) {
        next.bleeder = { pos: bleederPos, size: 1, rate: OOZE_RATE };
        next.decals = Array.from({ length: 6 }, (_, i) => spawnDecal(bleederPos, i + 1));
        next.nextId = 7;
      }
      if (sacPos) next.sacPos = sacPos;
      set({ ...next, activeTool: s.activeTool });
    },
    rupture: (point) => {
      const s = get();
      const pos = point ?? s.sacPos ?? s.bleeder?.pos;
      if (!pos) return;
      set({
        bleeder: merge(s.bleeder, { pos, size: 1.5, rate: RUPTURE_RATE }),
        counters: { ...s.counters, ruptures: s.counters.ruptures + 1 },
      });
      simHooks.onFact?.({ type: 'FAILURE', tool: s.activeTool, code: 'sac_rupture', severity: 'rupture' });
    },
    use: (i) => {
      const s = get();
      const def = TOOL_DEFS[s.activeTool];
      if (i.target === 'none' && def.mode !== 'hover') {
        if (s.heldMs !== 0) set({ heldMs: 0, lastTarget: 'none' });
        return;
      }
      if (def.mode === 'hold' && !i.down) {
        if (s.heldMs !== 0) set({ heldMs: 0 });
        return;
      }
      if (def.mode === 'click' && !i.click) return;

      const n: Partial<SimState> = {};
      const heldMs = def.mode === 'hold' ? (i.target === s.lastTarget ? s.heldMs + i.dtMs : i.dtMs) : 0;
      n.heldMs = heldMs;
      n.lastTarget = i.target;
      const ctx: UseContext = {
        target: i.target,
        fine: i.fine,
        heldMs,
        retractionMs: s.retraction.totalMs,
        clampMs: s.clamp.totalMs,
        bleeding: s.bleeder !== null,
      };
      simHooks.onFact?.({ type: 'USE', tool: def.id, target: i.target, fine: i.fine, dtMs: i.dtMs });
      const failure = def.failure(ctx);
      const emitted = failure ? emit(s, def.id, failure, n) : false;
      const ruptured = emitted && failure?.severity === 'rupture';

      const sec = i.dtMs / 1000;
      switch (def.effect) {
        case 'clear_blood':
        case 'absorb':
        case 'irrigate': {
          const radius = def.effect === 'irrigate' ? 0.22 : i.fine ? 0.05 : 0.1;
          const rate = def.effect === 'clear_blood' ? 1.6 : def.effect === 'absorb' ? 0.9 : 0.3;
          const decals = s.decals
            .map((d) => (dist(d.pos, i.point) < radius + d.r ? { ...d, a: d.a - rate * sec } : d))
            .filter((d) => d.a > 0);
          if (decals.length !== s.decals.length || decals.some((d, k) => d !== s.decals[k])) n.decals = decals;
          if (def.effect === 'irrigate') n.counters = { ...s.counters, irrigations: s.counters.irrigations + sec };
          break;
        }
        case 'coagulate':
          if (s.bleeder && dist(s.bleeder.pos, i.point) < 0.09) {
            const blind = poolAround(s.decals, s.bleeder.pos) > BLIND_POOL ? 0.2 : 1;
            const size = s.bleeder.size - sec * (i.fine ? 0.6 : 0.35) * blind;
            n.bleeder = size > 0 ? { ...s.bleeder, size } : null;
            if (size <= 0) {
              emit(s, def.id, { code: 'hemostasis', severity: 'info', message: 'Bleeder controlled.' }, n);
              fact('hemostasis');
            }
          }
          break;
        case 'cut':
          n.counters = { ...s.counters, cuts: s.counters.cuts + 1 };
          break;
        case 'dissect':
          n.counters = { ...s.counters, dissections: s.counters.dissections + sec };
          break;
        case 'retract':
          n.retraction = { ...s.retraction, on: !s.retraction.on, center: s.retraction.on ? s.retraction.center : i.point };
          fact(s.retraction.on ? 'retract_off' : 'retract_on');
          break;
        case 'clamp_temp':
          if (i.target === 'vessel') {
            n.clamp = { ...s.clamp, on: !s.clamp.on, pos: s.clamp.on ? s.clamp.pos : i.point };
            fact(s.clamp.on ? 'clamp_off' : 'clamp_on');
          }
          break;
        case 'clip_perm':
          if (i.target === 'sac' || i.target === 'vessel') {
            n.clips = [...s.clips, i.point];
            fact('clip_placed');
          }
          break;
        case 'doppler':
          n.doppler = i.target === 'none' || i.target === 'brain' ? 'none' : s.clamp.on ? 'clamped' : 'flow';
          if (n.doppler !== s.doppler && n.doppler !== 'none') fact(n.doppler === 'flow' ? 'doppler_flow' : 'doppler_clamped');
          break;
      }
      if (ruptured) {
        n.bleeder = merge(n.bleeder === undefined ? s.bleeder : n.bleeder, { pos: i.point, size: 1.5, rate: RUPTURE_RATE });
        n.counters = { ...(n.counters ?? s.counters), ruptures: (n.counters ?? s.counters).ruptures + 1 };
      }
      set(n);
    },
    tick: (dt) => {
      const s = get();
      const n: Partial<SimState> = { clock: s.clock + dt };
      if (s.retraction.on) n.retraction = { ...s.retraction, totalMs: s.retraction.totalMs + dt };
      if (s.clamp.on) n.clamp = { ...s.clamp, totalMs: s.clamp.totalMs + dt };
      const ctx: UseContext = {
        target: 'vessel',
        fine: false,
        heldMs: 0,
        retractionMs: n.retraction?.totalMs ?? s.retraction.totalMs,
        clampMs: n.clamp?.totalMs ?? s.clamp.totalMs,
        bleeding: s.bleeder !== null,
      };
      if (s.retraction.on) {
        const f = TOOL_DEFS.retractor.failure(ctx);
        if (f && emit(s, 'retractor', f, n)) {
          n.bleeder = merge(s.bleeder, { pos: s.retraction.center, size: 1, rate: RETRACTION_BLEED_RATE });
        }
      }
      if (s.clamp.on) {
        const f = TOOL_DEFS.temporary_clip.failure(ctx);
        if (f) emit(s, 'temporary_clip', f, n);
      }
      const bleeder = n.bleeder === undefined ? s.bleeder : n.bleeder;
      if (bleeder) {
        const mult = Math.min(8, Math.sqrt(bleeder.rate / OOZE_RATE));
        let acc = s.oozeAcc + (dt / 1000) * bleeder.size * mult;
        if (acc >= 0.6) {
          acc = 0;
          if (s.decals.length < MAX_DECALS) {
            n.decals = [...s.decals, spawnDecal(bleeder.pos, n.nextId ?? s.nextId)];
            n.nextId = (n.nextId ?? s.nextId) + 1;
          }
        }
        n.oozeAcc = acc;
      }
      set(n);
    },
  };
});
