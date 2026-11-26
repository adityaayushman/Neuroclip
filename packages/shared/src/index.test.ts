import { describe, expect, it } from 'vitest';
import { STEPS, TOOLS, TelemetryEventSchema, toolForKey } from './index';

describe('shared', () => {
  it('has six steps and ten tools', () => {
    expect(STEPS).toHaveLength(6);
    expect(TOOLS).toHaveLength(10);
  });
  it('maps keys 1-0 to tools', () => {
    expect(toolForKey('1')).toBe('suction');
    expect(toolForKey('0')).toBe('doppler');
    expect(toolForKey('x')).toBeUndefined();
  });
  it('validates telemetry', () => {
    expect(TelemetryEventSchema.safeParse({ t: 1, step: 'dural_opening', tool: null, kind: 'tick' }).success).toBe(true);
    expect(TelemetryEventSchema.safeParse({ t: -1, step: 'nope', tool: null, kind: '' }).success).toBe(false);
  });
});
