import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { clampZoom, useSession } from './session';
import { stepMachine } from './stepMachine';

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

describe('step machine', () => {
  it('walks six steps then finishes', () => {
    const a = createActor(stepMachine).start();
    expect(a.getSnapshot().value).toBe('positioning_craniotomy');
    for (let i = 0; i < 6; i++) a.send({ type: 'NEXT' });
    expect(a.getSnapshot().status).toBe('done');
  });
});
