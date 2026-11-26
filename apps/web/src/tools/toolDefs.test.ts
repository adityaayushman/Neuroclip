import { TOOLS, toolForKey } from '@neuroclip/shared';
import { describe, expect, it } from 'vitest';
import {
  CLAMP_LIMIT_MS,
  RETRACTION_LIMIT_MS,
  TOOL_DEFS,
  TOOL_LIST,
  type ToolDef,
  type UseContext,
} from './toolDefs';

const base: UseContext = { target: 'brain', fine: false, heldMs: 0, retractionMs: 0, clampMs: 0, bleeding: false };
const f = (id: ToolDef['id'], c: Partial<UseContext>) => TOOL_DEFS[id].failure({ ...base, ...c })?.code ?? null;

describe('toolDefs', () => {
  it('defines all ten tools in key order with unique keys', () => {
    expect(TOOL_LIST.map((t) => t.id)).toEqual([...TOOLS]);
    expect(new Set(TOOL_LIST.map((t) => t.key)).size).toBe(10);
    for (const t of TOOL_LIST) expect(toolForKey(t.key)).toBe(t.id);
  });
});

describe('failure rules', () => {
  it('suction', () => {
    expect(f('suction', { target: 'vessel' })).toBe('suction_tissue_damage');
    expect(f('suction', { target: 'vessel', fine: true })).toBeNull();
    expect(f('suction', { target: 'brain', heldMs: 3000 })).toBe('suction_tissue_damage');
    expect(f('suction', { target: 'brain', heldMs: 500 })).toBeNull();
  });
  it('bipolar', () => {
    expect(f('bipolar', { target: 'sac' })).toBe('bipolar_thermal_injury');
    expect(f('bipolar', { target: 'vessel', heldMs: 2000 })).toBe('bipolar_thermal_injury');
    expect(f('bipolar', { target: 'vessel', heldMs: 2000, bleeding: true })).toBeNull();
    expect(f('bipolar', { target: 'brain', heldMs: 3500 })).toBe('bipolar_thermal_injury');
  });
  it('microscissors', () => {
    expect(f('microscissors', { target: 'vessel' })).toBe('vessel_nick');
    expect(f('microscissors', { target: 'sac' })).toBe('vessel_nick');
    expect(f('microscissors', { target: 'brain' })).toBeNull();
  });
  it('dissector', () => {
    expect(f('dissector', { target: 'sac' })).toBe('sac_dissection_tear');
    expect(f('dissector', { target: 'sac', fine: true })).toBeNull();
    expect(f('dissector', { target: 'brain' })).toBeNull();
  });
  it('retractor', () => {
    expect(f('retractor', { retractionMs: RETRACTION_LIMIT_MS + 1 })).toBe('over_retraction');
    expect(f('retractor', { retractionMs: RETRACTION_LIMIT_MS - 1 })).toBeNull();
  });
  it('irrigation', () => {
    expect(f('irrigation', { heldMs: 4500 })).toBe('irrigation_overflow');
    expect(f('irrigation', { heldMs: 1000 })).toBeNull();
  });
  it('cottonoid', () => {
    expect(f('cottonoid', { target: 'sac' })).toBe('cottonoid_sac_pressure');
    expect(f('cottonoid', { target: 'sac', fine: true })).toBeNull();
    expect(f('cottonoid', { target: 'brain' })).toBeNull();
  });
  it('temporary clip', () => {
    expect(f('temporary_clip', { target: 'brain' })).toBe('temp_clip_misplaced');
    expect(f('temporary_clip', { target: 'vessel' })).toBeNull();
    expect(f('temporary_clip', { target: 'vessel', clampMs: CLAMP_LIMIT_MS + 1 })).toBe('prolonged_clamp');
  });
  it('clip applier', () => {
    expect(f('clip_applier', { target: 'vessel' })).toBe('parent_vessel_occlusion');
    expect(f('clip_applier', { target: 'sac' })).toBe('sac_clip_rupture');
    expect(f('clip_applier', { target: 'brain' })).toBe('clip_misplaced');
    expect(f('clip_applier', { target: 'sac', fine: true })).toBeNull();
  });
  it('doppler', () => {
    expect(f('doppler', { target: 'brain' })).toBe('doppler_no_signal');
    expect(f('doppler', { target: 'vessel' })).toBeNull();
    expect(f('doppler', { target: 'sac' })).toBeNull();
  });
});
