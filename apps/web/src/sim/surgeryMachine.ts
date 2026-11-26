import { STEPS, type Mode, type Step } from '@neuroclip/shared';
import { assign, setup } from 'xstate';
import { applyEvent, enterStep, initialContext, leaveStep, stepComplete, type SurgeryContext, type SurgeryEvent } from './surgeryLogic';

const next = (i: number): Step | 'done' => STEPS[i + 1] ?? 'done';

const stateFor = (step: Step) => ({
  entry: { type: 'enter' as const, params: { step } },
  exit: 'leave' as const,
  always: { guard: 'complete' as const, target: next(STEPS.indexOf(step)) },
});

export const surgeryMachine = setup({
  types: {
    context: {} as SurgeryContext,
    events: {} as SurgeryEvent,
    input: {} as { mode: Mode },
  },
  actions: {
    apply: assign(({ context, event }) => applyEvent(context, event)),
    enter: assign(({ context }, params: { step: Step }) => enterStep(context, params.step)),
    leave: assign(({ context }) => leaveStep(context)),
  },
  guards: { complete: ({ context }) => stepComplete(context) },
}).createMachine({
  id: 'surgery',
  context: ({ input }) => initialContext(input.mode),
  initial: STEPS[0],
  on: {
    USE: { actions: 'apply' },
    FACT: { actions: 'apply' },
    FAILURE: { actions: 'apply' },
    ALARM: { actions: 'apply' },
    CONFIRM: { actions: 'apply' },
    TICK: { actions: 'apply' },
    SET_MODE: { actions: 'apply' },
    RESET: { target: `.${STEPS[0]}`, reenter: true, actions: 'apply' },
  },
  states: {
    positioning_craniotomy: stateFor('positioning_craniotomy'),
    dural_opening: stateFor('dural_opening'),
    sylvian_dissection: stateFor('sylvian_dissection'),
    neck_parent_exposure: stateFor('neck_parent_exposure'),
    clip_placement: stateFor('clip_placement'),
    doppler_closure: stateFor('doppler_closure'),
    done: { type: 'final' },
  },
});
