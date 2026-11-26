import { STEPS, TOOLS } from '@neuroclip/shared';
import { createActor } from 'xstate';
import { afterEach, describe, expect, it } from 'vitest';
import { FAILURE_CODES, TOOL_DEFS, type TargetKind, type UseContext } from '../tools/toolDefs';
import { useSim } from '../tools/toolSim';
import { simHooks, type SimFact } from './events';
import { ERROR_LINES, STEP_INTRO } from './mentor';
import { STEP_DEFS } from './steps';
import { surgeryMachine } from './surgeryMachine';

const start = (mode: 'guided' | 'expert' | 'emergency' = 'guided') =>
  createActor(surgeryMachine, { input: { mode } }).start();
const use = (tool: SimFact & { type: 'USE' } extends infer U ? U extends { tool: infer T } ? T : never : never, o: Partial<Extract<SimFact, { type: 'USE' }>> = {}): SimFact => ({
  type: 'USE', tool, target: 'brain', fine: false, dtMs: 0, ...o,
});
const fact = (f: Extract<SimFact, { type: 'FACT' }>['fact']): SimFact => ({ type: 'FACT', fact: f });
const state = (a: ReturnType<typeof start>) => a.getSnapshot().value;

afterEach(() => {
  simHooks.onFact = undefined;
});

describe('surgery machine', () => {
  it('starts on step 1 with the intro line', () => {
    const a = start();
    expect(state(a)).toBe('positioning_craniotomy');
    expect(a.getSnapshot().context.mentor?.text).toBe(STEP_INTRO.positioning_craniotomy);
  });

  it('a scripted run drives all six steps to done', () => {
    const a = start();
    const visited: unknown[] = [state(a)];
    const send = (...evs: Parameters<typeof a.send>[0][]) => {
      for (const e of evs) a.send(e);
      const s = state(a);
      if (visited[visited.length - 1] !== s) visited.push(s);
    };
    send({ type: 'CONFIRM', itemId: 'head_position' });
    expect(state(a)).toBe('positioning_craniotomy');
    send({ type: 'CONFIRM', itemId: 'craniotomy' });
    send(use('microscissors'), use('microscissors'), use('microscissors'), use('irrigation', { dtMs: 2500 }));
    send(fact('retract_on'), use('dissector', { dtMs: 6500 }), use('suction', { dtMs: 2500 }));
    send(fact('hemostasis'), use('dissector', { target: 'sac', fine: true, dtMs: 4500 }), fact('doppler_flow'));
    send(fact('clamp_on'), fact('clip_placed'), fact('clamp_off'));
    send(fact('doppler_flow'), { type: 'CONFIRM', itemId: 'closure' });
    expect(state(a)).toBe('doppler_closure');
    send(fact('retract_off'));
    expect(visited).toEqual([...STEPS, 'done']);
    expect(a.getSnapshot().status).toBe('done');
    expect(a.getSnapshot().context.timeline).toHaveLength(6);
    expect(a.getSnapshot().context.errors).toHaveLength(0);
  });

  it('does not advance on out-of-order clip facts', () => {
    const a = start();
    for (const id of ['head_position', 'craniotomy']) a.send({ type: 'CONFIRM', itemId: id });
    expect(state(a)).toBe('dural_opening');
    a.send(fact('clip_placed'));
    expect(a.getSnapshot().context.progress.perm_clip).toBeUndefined();
  });

  it('invalid tool use triggers the wrong-tool mentor line and no progress', () => {
    const a = start();
    a.send(use('microscissors'));
    const c = a.getSnapshot().context;
    expect(c.mentor?.kind).toBe('error');
    expect(c.mentor?.text).toContain('Scissors');
    expect(c.mentor?.text).toContain('Positioning and craniotomy');
    expect(c.mentor?.text).toContain('Irrigation');
    expect(c.errors.map((e) => e.code)).toEqual(['wrong_tool']);
    expect(Object.keys(c.progress)).toHaveLength(0);
    a.send(use('microscissors'));
    expect(a.getSnapshot().context.errors).toHaveLength(1);
    a.send({ type: 'TICK', dtMs: 3500 });
    a.send(use('microscissors'));
    expect(a.getSnapshot().context.errors).toHaveLength(2);
  });

  it('tool failures map to their scripted mentor line', () => {
    const a = start();
    a.send({ type: 'FAILURE', tool: 'microscissors', code: 'vessel_nick', severity: 'rupture' });
    expect(a.getSnapshot().context.mentor?.text).toBe(ERROR_LINES.vessel_nick);
    expect(a.getSnapshot().context.mentor?.severity).toBe('rupture');
    a.send({ type: 'FAILURE', tool: 'doppler', code: 'hemostasis', severity: 'info' });
    expect(a.getSnapshot().context.errors).toHaveLength(1);
  });

  it('expert mode hides hints but still reports ruptures', () => {
    const a = start('expert');
    expect(a.getSnapshot().context.mentor).toBeNull();
    a.send(use('microscissors'));
    expect(a.getSnapshot().context.mentor).toBeNull();
    expect(a.getSnapshot().context.errors).toHaveLength(1);
    a.send({ type: 'FAILURE', tool: 'dissector', code: 'sac_dissection_tear', severity: 'rupture' });
    expect(a.getSnapshot().context.mentor?.text).toBe(ERROR_LINES.sac_dissection_tear);
  });

  it('nudges after a step exceeds its soft time limit, once', () => {
    const a = start();
    a.send({ type: 'TICK', dtMs: STEP_DEFS[0]!.softLimitMs + 1000 });
    const id = a.getSnapshot().context.mentor!.id;
    expect(a.getSnapshot().context.slowWarned).toBe(true);
    a.send({ type: 'TICK', dtMs: 5000 });
    expect(a.getSnapshot().context.mentor!.id).toBe(id);
  });

  it('RESET returns to step 1', () => {
    const a = start();
    a.send({ type: 'CONFIRM', itemId: 'head_position' });
    a.send({ type: 'CONFIRM', itemId: 'craniotomy' });
    a.send({ type: 'RESET' });
    expect(state(a)).toBe('positioning_craniotomy');
    expect(a.getSnapshot().context.progress).toEqual({});
  });
});

describe('mentor script coverage', () => {
  it('has a line for every failure code, and the codes list matches the rules', () => {
    const seen = new Set<string>();
    const targets: TargetKind[] = ['brain', 'vessel', 'sac', 'none'];
    for (const id of TOOLS) {
      for (const target of targets)
        for (const fine of [false, true])
          for (const heldMs of [0, 5000])
            for (const bleeding of [false, true])
              for (const big of [0, 1e9]) {
                const ctx: UseContext = { target, fine, heldMs, bleeding, retractionMs: big, clampMs: big };
                const f = TOOL_DEFS[id].failure(ctx);
                if (f) seen.add(f.code);
              }
    }
    expect([...seen].sort()).toEqual([...FAILURE_CODES].sort());
    for (const code of FAILURE_CODES) expect(ERROR_LINES[code]).toBeTruthy();
  });
});

describe('sim to machine bridge', () => {
  it('a real tool failure in the sim reaches the mentor', () => {
    const a = start();
    simHooks.onFact = (f) => a.send(f);
    const sim = useSim.getState();
    sim.reset();
    sim.selectTool('microscissors');
    sim.use({ target: 'vessel', point: [0, 0, 0], fine: false, dtMs: 0, down: true, click: true });
    expect(a.getSnapshot().context.errors.map((e) => e.code)).toContain('vessel_nick');
    expect(a.getSnapshot().context.mentor?.text).toBe(ERROR_LINES.vessel_nick);
  });

  it('sim facts advance checklist progress', () => {
    const a = start();
    for (const id of ['head_position', 'craniotomy']) a.send({ type: 'CONFIRM', itemId: id });
    simHooks.onFact = (f) => a.send(f);
    const sim = useSim.getState();
    sim.reset();
    sim.selectTool('microscissors');
    for (let i = 0; i < 3; i++) sim.use({ target: 'brain', point: [0, 0, 0], fine: false, dtMs: 0, down: true, click: true });
    expect(a.getSnapshot().context.progress.dura_cut).toBe(3);
  });
});
