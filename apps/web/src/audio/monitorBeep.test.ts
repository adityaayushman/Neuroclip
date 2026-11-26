import { describe, expect, it } from 'vitest';
import { beepFrequency, beepIntervalMs } from './monitorBeep';

describe('monitor beep', () => {
  it('beep rate follows HR', () => {
    expect(beepIntervalMs(60)).toBeCloseTo(1000);
    expect(beepIntervalMs(120)).toBeCloseTo(500);
    expect(beepIntervalMs(120)).toBeLessThan(beepIntervalMs(70));
    expect(beepIntervalMs(0)).toBeLessThanOrEqual(3000);
  });
  it('pitch drops as SpO2 falls and stays bounded', () => {
    expect(beepFrequency(99)).toBeGreaterThan(beepFrequency(92));
    expect(beepFrequency(92)).toBeGreaterThan(beepFrequency(85));
    expect(beepFrequency(100)).toBe(880);
    expect(beepFrequency(0)).toBe(300);
  });
});
