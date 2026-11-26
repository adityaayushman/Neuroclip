import { STEPS, type Step, type TelemetryEvent, type ToolId } from '@neuroclip/shared';
import { useSim } from '../tools/toolSim';
import { simHooks, type SimFact } from './events';
import { surgery } from './surgeryStore';
import { useVitals } from './vitalsStore';

const MAX_EVENTS = 19_000;
const VITALS_EVERY_MS = 2000;

interface UseBucket {
  tool: ToolId;
  target: string;
  fine: boolean;
  ms: number;
  n: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

class TelemetryRecorder {
  private events: TelemetryEvent[] = [];
  private buckets = new Map<string, UseBucket>();
  private started = false;
  private lastStep: Step | null = null;
  private exited = false;
  private lastVitalsAt = 0;
  private unsubs: (() => void)[] = [];

  start() {
    if (this.started) return;
    this.started = true;
    const prev = simHooks.onFact;
    simHooks.onFact = (f) => {
      prev?.(f);
      this.onFact(f);
    };
    const sub = surgery.subscribe((snap) => this.onSurgery(snap.context.step, snap.matches('done')));
    this.unsubs.push(() => sub.unsubscribe());
    this.unsubs.push(
      useSim.subscribe((s, p) => {
        if (s.activeTool !== p.activeTool) this.push('tool_select', s.activeTool);
      }),
    );
    this.unsubs.push(
      useSim.subscribe((s) => {
        if (s.clock - this.lastVitalsAt >= VITALS_EVERY_MS) this.sampleVitals(s.clock);
      }),
    );
    this.onSurgery(surgery.getSnapshot().context.step, false);
  }

  reset() {
    this.events = [];
    this.buckets.clear();
    this.lastStep = null;
    this.exited = false;
    this.lastVitalsAt = 0;
    this.onSurgery(surgery.getSnapshot().context.step, false);
  }

  snapshot(): TelemetryEvent[] {
    this.flushBuckets();
    return this.events.map((e) => ({ ...e }));
  }

  private now() {
    return Math.round(useSim.getState().clock);
  }

  private push(kind: string, tool: ToolId | null, data?: Record<string, string | number | boolean | null>, step?: Step) {
    if (this.events.length >= MAX_EVENTS) return;
    this.events.push({
      t: Math.max(this.now(), this.events.at(-1)?.t ?? 0),
      step: step ?? surgery.getSnapshot().context.step,
      tool,
      kind,
      data: data ?? null,
    });
  }

  private onSurgery(step: Step, done: boolean) {
    if (this.lastStep === null) {
      this.lastStep = step;
      this.push('step_enter', null, undefined, step);
      return;
    }
    if (done && !this.exited) {
      this.exited = true;
      this.flushBuckets();
      this.push('step_exit', null, undefined, this.lastStep);
      return;
    }
    if (step !== this.lastStep && STEPS.includes(step)) {
      this.flushBuckets();
      this.push('step_exit', null, undefined, this.lastStep);
      this.lastStep = step;
      this.push('step_enter', null, undefined, step);
    }
  }

  private onFact(f: SimFact) {
    switch (f.type) {
      case 'USE': {
        const key = `${f.tool}|${f.target}|${f.fine}`;
        const b = this.buckets.get(key) ?? { tool: f.tool, target: f.target, fine: f.fine, ms: 0, n: 0 };
        b.ms += f.dtMs;
        b.n += 1;
        this.buckets.set(key, b);
        break;
      }
      case 'FACT':
        this.push('fact', null, { fact: f.fact });
        break;
      case 'FAILURE':
        this.push('failure', f.tool, { code: f.code, severity: f.severity });
        break;
      case 'ALARM':
        this.push('alarm', null, { code: f.code });
        break;
    }
  }

  private flushBuckets() {
    for (const b of this.buckets.values()) {
      this.push('use', b.tool, { target: b.target, fine: b.fine, ms: Math.round(b.ms), n: b.n });
    }
    this.buckets.clear();
  }

  private sampleVitals(clock: number) {
    this.lastVitalsAt = clock;
    this.flushBuckets();
    const v = useVitals.getState().v;
    this.push('vitals', null, {
      hr: round2(v.hr),
      sbp: round2(v.sbp),
      dbp: round2(v.dbp),
      spo2: round2(v.spo2),
      icp: round2(v.icp),
      vol: round2(v.vol),
    });
  }
}

export const telemetry = new TelemetryRecorder();
