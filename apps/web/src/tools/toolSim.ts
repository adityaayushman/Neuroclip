import { create } from 'zustand';
import { Vector3 } from 'three';
import type { ToolId } from '@neuroclip/shared';
import { surfacePoint } from '../lib/brain';
import { mulberry32 } from '../lib/rng';
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

const MAX_DECALS = 24;
const EVENT_THROTTLE_MS = 1500;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let rand = mulberry32(1);

interface SimState {
  activeTool: ToolId;
  clock: number;
  decals: Decal[];
  bleeder: { pos: V3; size: number } | null;
  oozeAcc: number;
  retraction: { on: boolean; totalMs: number; center: V3 };
  clamp: { on: boolean; totalMs: number; pos: V3 };
  clips: V3[];
  events: SimEvent[];
  lastFail: Record<string, number>;
  doppler: DopplerState;
  counters: { cuts: number; dissections: number; irrigations: number };
  heldMs: number;
  lastTarget: TargetKind;
  nextId: number;
  selectTool: (id: ToolId) => void;
  reset: (bleederPos?: V3) => void;
  use: (i: UseInput) => void;
  tick: (dtMs: number) => void;
}

const initial = () => ({
  clock: 0,
  decals: [] as Decal[],
  bleeder: null as SimState['bleeder'],
  oozeAcc: 0,
  retraction: { on: false, totalMs: 0, center: [0, 0, 0] as V3 },
  clamp: { on: false, totalMs: 0, pos: [0, 0, 0] as V3 },
  clips: [] as V3[],
  events: [] as SimEvent[],
  lastFail: {} as Record<string, number>,
  doppler: 'none' as DopplerState,
  counters: { cuts: 0, dissections: 0, irrigations: 0 },
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
    if (s.clock - last < EVENT_THROTTLE_MS) return;
    const nextId = n.nextId ?? s.nextId;
    n.events = [...(n.events ?? s.events), { ...f, id: nextId, t: s.clock, tool }].slice(-30);
    n.lastFail = { ...(n.lastFail ?? s.lastFail), [f.code]: s.clock };
    n.nextId = nextId + 1;
  };

  return {
    activeTool: 'suction',
    ...initial(),
    selectTool: (activeTool) => set({ activeTool, heldMs: 0 }),
    reset: (bleederPos) => {
      rand = mulberry32(1);
      const s = get();
      const next: Partial<SimState> = { ...initial() };
      if (bleederPos) {
        next.bleeder = { pos: bleederPos, size: 1 };
        next.decals = Array.from({ length: 6 }, (_, i) => spawnDecal(bleederPos, i + 1));
        next.nextId = 7;
      }
      set({ ...next, activeTool: s.activeTool });
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
      const failure = def.failure(ctx);
      if (failure) emit(s, def.id, failure, n);

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
            const size = s.bleeder.size - sec * (i.fine ? 0.6 : 0.35);
            n.bleeder = size > 0 ? { ...s.bleeder, size } : null;
            if (size <= 0) emit(s, def.id, { code: 'hemostasis', severity: 'info', message: 'Bleeder controlled.' }, n);
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
          break;
        case 'clamp_temp':
          if (i.target === 'vessel') n.clamp = { ...s.clamp, on: !s.clamp.on, pos: s.clamp.on ? s.clamp.pos : i.point };
          break;
        case 'clip_perm':
          if (i.target === 'sac' || i.target === 'vessel') n.clips = [...s.clips, i.point];
          break;
        case 'doppler':
          n.doppler = i.target === 'none' || i.target === 'brain' ? 'none' : s.clamp.on ? 'clamped' : 'flow';
          break;
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
        if (f) emit(s, 'retractor', f, n);
      }
      if (s.clamp.on) {
        const f = TOOL_DEFS.temporary_clip.failure(ctx);
        if (f) emit(s, 'temporary_clip', f, n);
      }
      if (s.bleeder) {
        let acc = s.oozeAcc + (dt / 1000) * s.bleeder.size;
        if (acc >= 0.6) {
          acc = 0;
          if (s.decals.length < MAX_DECALS) {
            n.decals = [...s.decals, spawnDecal(s.bleeder.pos, n.nextId ?? s.nextId)];
            n.nextId = (n.nextId ?? s.nextId) + 1;
          }
        }
        n.oozeAcc = acc;
      }
      set(n);
    },
  };
});
