import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { surgery } from '../sim/surgeryStore';
import { useSim } from '../tools/toolSim';
import { useSession } from './session';
import { startRun } from './startRun';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  startRun('guided');
});

describe('startRun', () => {
  it('restarts a guided run without any scripted events', () => {
    const id = useSession.getState().runId;
    startRun('guided', 2);
    expect(useSession.getState().seed).toBe(2);
    expect(useSession.getState().runId).toBe(id + 1);
    vi.advanceTimersByTime(10_000);
    expect(surgery.getSnapshot().context.step).toBe('positioning_craniotomy');
  });

  it('emergency holds step 1 past the too-fast limit, then ruptures', () => {
    const spy = vi.fn();
    useSim.setState({ rupture: spy });
    startRun('emergency');
    expect(useSession.getState().mode).toBe('emergency');
    vi.advanceTimersByTime(3300);
    expect(surgery.getSnapshot().context.step).toBe('dural_opening');
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1600);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
