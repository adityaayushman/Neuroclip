import { useSyncExternalStore } from 'react';
import type { Mode } from '@neuroclip/shared';
import { createActor, type SnapshotFrom } from 'xstate';
import { simHooks } from './events';
import { surgeryMachine } from './surgeryMachine';

export type SurgerySnapshot = SnapshotFrom<typeof surgeryMachine>;

export function createSurgery(mode: Mode = 'guided') {
  return createActor(surgeryMachine, { input: { mode } }).start();
}

export const surgery = createSurgery();
simHooks.onFact = (f) => surgery.send(f);

export function useSurgery<T>(select: (s: SurgerySnapshot) => T): T {
  return useSyncExternalStore(
    (cb) => {
      const sub = surgery.subscribe(cb);
      return () => sub.unsubscribe();
    },
    () => select(surgery.getSnapshot()),
  );
}
