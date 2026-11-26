import { describe, expect, it } from 'vitest';
import { clampZoom, useSession } from './session';

describe('session store', () => {
  it('clamps zoom to 1x-4x', () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(9)).toBe(4);
    useSession.getState().setZoom(2.5);
    expect(useSession.getState().zoom).toBe(2.5);
  });
});

describe('session store extras', () => {
  it('bounds focus and heart rate and toggles fine mode', () => {
    const s = useSession.getState();
    s.setFocus(5);
    s.setHr(500);
    s.setFine(true);
    expect(useSession.getState()).toMatchObject({ focus: 1, hr: 200, fine: true });
    s.setHr(-3);
    expect(useSession.getState().hr).toBe(30);
  });
});
