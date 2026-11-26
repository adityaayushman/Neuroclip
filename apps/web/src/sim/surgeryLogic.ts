import { STEPS, type Mode, type Step } from '@neuroclip/shared';
import type { SimFact } from './events';
import { ERROR_LINES, SLOW_LINE, STEP_INTRO, mentorAudible, wrongToolLine, type MentorKind, type MentorLine } from './mentor';
import { STEP_DEFS, itemDone, stepDef, type Progress, type World } from './steps';
import type { Severity } from '../tools/toolDefs';

export interface ErrorRecord {
  t: number;
  step: Step;
  tool: string;
  code: string;
  severity: Severity;
}

export interface SurgeryContext {
  mode: Mode;
  step: Step;
  progress: Progress;
  world: World;
  clockMs: number;
  stepElapsedMs: number;
  slowWarned: boolean;
  errors: ErrorRecord[];
  lastErrorAt: Record<string, number>;
  timeline: { step: Step; ms: number }[];
  mentor: MentorLine | null;
  mentorSeq: number;
}

export type SurgeryEvent =
  | SimFact
  | { type: 'CONFIRM'; itemId: string }
  | { type: 'TICK'; dtMs: number }
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'RESET' };

const ERROR_THROTTLE_MS = 3000;

export const initialContext = (mode: Mode): SurgeryContext => ({
  mode,
  step: STEPS[0],
  progress: {},
  world: { retractorOn: false, clampOn: false },
  clockMs: 0,
  stepElapsedMs: 0,
  slowWarned: false,
  errors: [],
  lastErrorAt: {},
  timeline: [],
  mentor: null,
  mentorSeq: 0,
});

function say(c: SurgeryContext, text: string, kind: MentorKind, severity?: Severity): SurgeryContext {
  if (!mentorAudible(c.mode, kind, severity)) return c;
  const seq = c.mentorSeq + 1;
  return { ...c, mentorSeq: seq, mentor: { id: seq, text, kind, severity } };
}

function recordError(c: SurgeryContext, tool: string, code: string, severity: Severity, text: string): SurgeryContext {
  const key = `${code}:${tool}`;
  if (c.clockMs - (c.lastErrorAt[key] ?? -Infinity) < ERROR_THROTTLE_MS) return c;
  const next = {
    ...c,
    lastErrorAt: { ...c.lastErrorAt, [key]: c.clockMs },
    errors: [...c.errors, { t: c.clockMs, step: c.step, tool, code, severity }],
  };
  return say(next, text, 'error', severity);
}

export function enterStep(c: SurgeryContext, step: Step): SurgeryContext {
  const n = STEPS.indexOf(step);
  const prefix = n > 0 ? `Step ${n} complete. ` : '';
  const base = { ...c, step, progress: {}, stepElapsedMs: 0, slowWarned: false };
  return say(base, prefix + STEP_INTRO[step], n > 0 ? 'praise' : 'hint');
}

export function leaveStep(c: SurgeryContext): SurgeryContext {
  return { ...c, timeline: [...c.timeline, { step: c.step, ms: c.stepElapsedMs }] };
}

export function stepComplete(c: SurgeryContext): boolean {
  return stepDef(c.step).items.every((it) => itemDone(it, c.progress, c.world));
}

function addProgress(c: SurgeryContext, e: SimFact): SurgeryContext {
  let progress = c.progress;
  for (const it of stepDef(c.step).items) {
    const inc = it.match?.(e, progress) ?? 0;
    if (inc > 0) progress = { ...progress, [it.id]: (progress[it.id] ?? 0) + inc };
  }
  return progress === c.progress ? c : { ...c, progress };
}

export function applyEvent(c: SurgeryContext, e: SurgeryEvent): SurgeryContext {
  switch (e.type) {
    case 'USE': {
      const def = stepDef(c.step);
      if (!def.allowedTools.includes(e.tool)) {
        return recordError(c, e.tool, 'wrong_tool', 'warning', wrongToolLine(def.title, e.tool, def.allowedTools));
      }
      return addProgress(c, e);
    }
    case 'FACT': {
      let next = c;
      if (e.fact === 'retract_on' || e.fact === 'retract_off') {
        next = { ...next, world: { ...next.world, retractorOn: e.fact === 'retract_on' } };
      }
      if (e.fact === 'clamp_on' || e.fact === 'clamp_off') {
        next = { ...next, world: { ...next.world, clampOn: e.fact === 'clamp_on' } };
      }
      return addProgress(next, e);
    }
    case 'FAILURE': {
      if (e.severity === 'info') return c;
      const text = ERROR_LINES[e.code] ?? 'Check your technique.';
      return recordError(c, e.tool, e.code, e.severity, text);
    }
    case 'CONFIRM': {
      const it = stepDef(c.step).items.find((i) => i.id === e.itemId && i.confirm);
      if (!it || (c.progress[it.id] ?? 0) >= it.target) return c;
      return { ...c, progress: { ...c.progress, [it.id]: it.target } };
    }
    case 'TICK': {
      let next = { ...c, clockMs: c.clockMs + e.dtMs, stepElapsedMs: c.stepElapsedMs + e.dtMs };
      if (!next.slowWarned && next.stepElapsedMs > stepDef(c.step).softLimitMs) {
        next = say({ ...next, slowWarned: true }, SLOW_LINE, 'hint');
      }
      return next;
    }
    case 'SET_MODE':
      return { ...c, mode: e.mode };
    case 'RESET':
      return initialContext(c.mode);
  }
}

export const STEP_IDS = STEP_DEFS.map((s) => s.id);
