import { createMachine } from 'xstate';

export const stepMachine = createMachine({
  id: 'procedure',
  initial: 'positioning_craniotomy',
  states: {
    positioning_craniotomy: { on: { NEXT: 'dural_opening' } },
    dural_opening: { on: { NEXT: 'sylvian_dissection', BACK: 'positioning_craniotomy' } },
    sylvian_dissection: { on: { NEXT: 'neck_parent_exposure', BACK: 'dural_opening' } },
    neck_parent_exposure: { on: { NEXT: 'clip_placement', BACK: 'sylvian_dissection' } },
    clip_placement: { on: { NEXT: 'doppler_closure', BACK: 'neck_parent_exposure' } },
    doppler_closure: { on: { NEXT: 'done' } },
    done: { type: 'final' },
  },
});
