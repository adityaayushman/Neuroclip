import { TelemetryBatchSchema } from '@neuroclip/shared';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { simHooks, type SimFact } from './events';
import { surgery } from './surgeryStore';
import { telemetry } from './telemetry';
import { useVitals } from './vitalsStore';
import { useSim } from '../tools/toolSim';

const emit = (f: SimFact) => simHooks.onFact?.(f);
const fact = (name: Extract<SimFact, { type: 'FACT' }>['fact']): SimFact => ({ type: 'FACT', fact: name });
const use = (tool: Extract<SimFact, { type: 'USE' }>['tool'], dtMs: number, target: 'brain' | 'vessel' | 'sac' = 'brain', fine = false): SimFact => ({
  type: 'USE', tool, target, fine, dtMs,
});

beforeAll(() => telemetry.start());
beforeEach(() => {
  surgery.send({ type: 'RESET' });
  useSim.getState().reset();
  useVitals.getState().reset();
  telemetry.reset();
});

describe('telemetry recorder', () => {
  it('records a full scripted run that validates against the shared schema', () => {
    const sim = useSim.getState();
    const advance = (ms: number) => {
      sim.tick(ms);
      useSim.setState({}); // notify subscribers
    };
    advance(1000);
    surgery.send({ type: 'CONFIRM', itemId: 'head_position' });
    surgery.send({ type: 'CONFIRM', itemId: 'craniotomy' });
    advance(2500);
    for (let i = 0; i < 3; i++) emit(use('microscissors', 0));
    emit(use('irrigation', 2500));
    advance(2500);
    emit(fact('retract_on'));
    emit(use('dissector', 6500));
    emit(use('suction', 2500));
    advance(2500);
    emit(fact('hemostasis'));
    emit(use('dissector', 4500, 'sac', true));
    emit(fact('doppler_flow'));
    advance(2500);
    emit({ type: 'FAILURE', tool: 'suction', code: 'suction_tissue_damage', severity: 'injury' });
    emit(fact('clamp_on'));
    emit(fact('clip_placed'));
    emit(fact('clamp_off'));
    advance(2500);
    emit(fact('doppler_flow'));
    surgery.send({ type: 'CONFIRM', itemId: 'closure' });
    emit(fact('retract_off'));
    emit({ type: 'ALARM', code: 'hypotension' });

    expect(surgery.getSnapshot().matches('done')).toBe(true);
    const events = telemetry.snapshot();
    expect(TelemetryBatchSchema.safeParse({ offset: 0, events }).success).toBe(true);

    const times = events.map((e) => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(events.filter((e) => e.kind === 'step_enter')).toHaveLength(6);
    expect(events.filter((e) => e.kind === 'step_exit')).toHaveLength(6);
    expect(events.find((e) => e.kind === 'failure')?.data).toEqual({ code: 'suction_tissue_damage', severity: 'injury' });
    expect(events.some((e) => e.kind === 'alarm')).toBe(true);
    expect(events.some((e) => e.kind === 'vitals')).toBe(true);
    const uses = events.filter((e) => e.kind === 'use' && e.tool === 'dissector');
    expect(uses.length).toBeGreaterThan(0);
    expect(events.every((e) => !('score' in (e.data ?? {})))).toBe(true);
  });

  it('aggregates high-frequency use events into compact buckets', () => {
    for (let i = 0; i < 600; i++) emit(use('suction', 16, 'brain', true));
    const uses = telemetry.snapshot().filter((e) => e.kind === 'use');
    expect(uses).toHaveLength(1);
    expect(uses[0]?.data).toMatchObject({ n: 600, target: 'brain', fine: true });
    expect(Number(uses[0]?.data?.ms)).toBeGreaterThan(9000);
  });

  it('records tool selection and starts with a step_enter', () => {
    useSim.getState().selectTool('doppler');
    const events = telemetry.snapshot();
    expect(events[0]).toMatchObject({ kind: 'step_enter', step: 'positioning_craniotomy' });
    expect(events.some((e) => e.kind === 'tool_select' && e.tool === 'doppler')).toBe(true);
  });
});
