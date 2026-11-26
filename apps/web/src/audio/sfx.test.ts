import { describe, expect, it } from 'vitest';
import { sfxFor } from './sfx';

describe('sfxFor', () => {
  it('maps facts, failures and tool use to sounds', () => {
    expect(sfxFor({ type: 'FACT', fact: 'clip_placed' })).toBe('clip');
    expect(sfxFor({ type: 'FACT', fact: 'hemostasis' })).toBe('chime');
    expect(sfxFor({ type: 'FACT', fact: 'retract_on' })).toBeNull();
    expect(sfxFor({ type: 'FAILURE', tool: 'bipolar', code: 'x', severity: 'rupture' })).toBe('thud');
    expect(sfxFor({ type: 'FAILURE', tool: 'bipolar', code: 'x', severity: 'injury' })).toBe('warn');
    expect(sfxFor({ type: 'FAILURE', tool: 'bipolar', code: 'x', severity: 'info' })).toBeNull();
    expect(sfxFor({ type: 'USE', tool: 'suction', target: 'brain', fine: false, dtMs: 16 })).toBe('hiss');
    expect(sfxFor({ type: 'USE', tool: 'cottonoid', target: 'brain', fine: false, dtMs: 16 })).toBeNull();
    expect(sfxFor({ type: 'ALARM', code: 'spo2' })).toBeNull();
  });
});
