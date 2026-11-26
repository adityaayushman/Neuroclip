import type { Mode } from '@neuroclip/shared';
import { surgery } from '../sim/surgeryStore';
import { useSim } from '../tools/toolSim';
import { useSession } from './session';

const EMERGENCY_CONFIRM_MS = 3200;
const EMERGENCY_RUPTURE_MS = 4800;
let timers: ReturnType<typeof setTimeout>[] = [];

/** Restarts the whole run. Emergency begins with an intra-operative rupture. Step 1 is held >3 s so the server's too-fast check stays honest. */
export function startRun(mode: Mode, seed?: number) {
  timers.forEach(clearTimeout);
  timers = [];
  const s = useSession.getState();
  s.setMode(mode);
  if (seed !== undefined) s.setSeed(seed);
  surgery.send({ type: 'RESET' });
  surgery.send({ type: 'SET_MODE', mode });
  s.bumpRun();
  if (mode !== 'emergency') return;
  timers.push(
    setTimeout(() => {
      surgery.send({ type: 'CONFIRM', itemId: 'head_position' });
      surgery.send({ type: 'CONFIRM', itemId: 'craniotomy' });
    }, EMERGENCY_CONFIRM_MS),
    setTimeout(() => useSim.getState().rupture(), EMERGENCY_RUPTURE_MS),
  );
}
