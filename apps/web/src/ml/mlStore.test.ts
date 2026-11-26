import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { RISK_LINE } from '../sim/mentor';
import { surgery } from '../sim/surgeryStore';
import { FEATURES, F, WINDOW_STEPS, SAMPLES_PER_STEP } from './features';
import { WARMUP_SAMPLES, useMl } from './mlStore';
import type { ModelMeta, OutMessage } from './protocol';

type Result = Extract<OutMessage, { type: 'result' }>;
const res = (n: number, o: Partial<Result> = {}): Result => ({
  type: 'result', n, skill: 0.5, risk: 0.05, skillLogit: 0, riskLogit: -3, ms: 1, ...o,
});

const toDuralOpening = () => {
  surgery.send({ type: 'CONFIRM', itemId: 'head_position' });
  surgery.send({ type: 'CONFIRM', itemId: 'craniotomy' });
};

beforeEach(() => {
  surgery.send({ type: 'RESET' });
  useMl.getState().reset();
  useMl.setState({ alertThreshold: 0.3, status: 'ready' });
});

describe('ml store', () => {
  it('averages skill only after warm-up and tracks latency', () => {
    const ml = () => useMl.getState();
    ml().push(res(10, { skill: 0.9, ms: 3 }));
    expect(ml().skillEstimate()).toBeNull();
    ml().push(res(WARMUP_SAMPLES, { skill: 0.2, ms: 1 }));
    ml().push(res(WARMUP_SAMPLES + 1, { skill: 0.4, ms: 2 }));
    expect(ml().skillEstimate()).toBeCloseTo(0.3);
    expect(ml().maxMs).toBe(3);
    expect(ml().ms).toBe(2);
  });

  it('raises a mentor warning for sustained high risk, then respects the cooldown', () => {
    toDuralOpening();
    const ml = () => useMl.getState();
    const mentor = () => surgery.getSnapshot().context.mentor;
    const before = mentor()?.id;
    let n = WARMUP_SAMPLES;
    for (let i = 0; i < 5; i++) ml().push(res(n++, { risk: 0.8 }));
    ml().push(res(n++, { risk: 0.1 }));
    for (let i = 0; i < 9; i++) ml().push(res(n++, { risk: 0.8 }));
    expect(mentor()?.id).toBe(before);

    ml().push(res(n++, { risk: 0.8 }));
    expect(mentor()?.text).toBe(RISK_LINE);
    const id = mentor()!.id;

    for (let i = 0; i < 30; i++) ml().push(res(n++, { risk: 0.9 }));
    expect(mentor()?.id).toBe(id);

    n += 200;
    for (let i = 0; i < 10; i++) ml().push(res(n++, { risk: 0.9 }));
    expect(mentor()!.id).toBeGreaterThan(id);
  });

  it('never warns during positioning (nothing can rupture yet)', () => {
    const before = surgery.getSnapshot().context.mentor?.id;
    for (let n = WARMUP_SAMPLES; n < WARMUP_SAMPLES + 60; n++) useMl.getState().push(res(n, { risk: 0.95 }));
    expect(surgery.getSnapshot().context.mentor?.id).toBe(before);
  });

  it('stays quiet during warm-up', () => {
    toDuralOpening();
    const before = surgery.getSnapshot().context.mentor?.id;
    for (let n = 1; n < 40; n++) useMl.getState().push(res(n, { risk: 0.95 }));
    expect(surgery.getSnapshot().context.mentor?.id).toBe(before);
  });
});

describe('exported model metadata', () => {
  const path = resolve(__dirname, '../../public/models/model_meta.json');
  it.skipIf(!existsSync(path))('matches the TypeScript feature schema', () => {
    const meta = JSON.parse(readFileSync(path, 'utf8')) as ModelMeta;
    expect(meta.features).toEqual([...FEATURES]);
    expect(meta.window_steps).toBe(WINDOW_STEPS);
    expect(meta.samples_per_step).toBe(SAMPLES_PER_STEP);
    expect(meta.normalization.mean).toHaveLength(F);
    expect(meta.normalization.std).toHaveLength(F);
    expect(meta.normalization.std.every((s) => s > 0)).toBe(true);
    expect(meta.rupture.alert_threshold).toBeGreaterThan(0);
    expect(meta.rupture.alert_threshold).toBeLessThan(1);
  });
});
