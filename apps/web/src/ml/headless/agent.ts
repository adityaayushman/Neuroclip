import { TOOLS, type Step, type ToolId } from '@neuroclip/shared';
import { stepDef, type Progress } from '../../sim/steps';
import type { TargetKind } from '../../tools/toolDefs';
import { TOOL_DEFS } from '../../tools/toolDefs';
import type { Bleeder, Decal, V3 } from '../../tools/toolSim';

export interface AgentParams {
  skill: number;
  latency: number;
  err: number;
  pFine: number;
  reactMs: number;
  releaseProb: number;
  overIrrigate: number;
  wrongTool: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** `skill` and `speed` (user style) fully determine behaviour; higher skill means fewer, smaller mistakes. */
export function paramsFor(skill: number, speed: number): AgentParams {
  const s = clamp(skill, 0, 1);
  return {
    skill: s,
    latency: (0.3 + 1.1 * (1 - s)) * speed,
    err: 0.5 * (1 - s) ** 1.4,
    pFine: 0.3 + 0.67 * s,
    reactMs: (1200 + 7000 * (1 - s)) * speed,
    releaseProb: 0.2 + 0.8 * s,
    overIrrigate: 0.5 * (1 - s),
    wrongTool: 0.14 * (1 - s),
  };
}

export type Prim =
  | { t: 'wait'; ms: number }
  | { t: 'tool'; id: ToolId }
  | { t: 'hold'; target: TargetKind; point: V3; ms: number; fine: boolean }
  | { t: 'click'; target: TargetKind; point: V3; fine: boolean }
  | { t: 'hover'; target: TargetKind; point: V3; ms: number }
  | { t: 'confirm'; itemId: string };

export interface AgentView {
  step: Step;
  progress: Progress;
  activeTool: ToolId;
  bleeder: Bleeder | null;
  decals: Decal[];
  retractionOn: boolean;
  pool: number;
}

export interface AgentWorld {
  points: { brain: V3; vessel: V3; sac: V3 };
  view(): AgentView;
}

const SERIOUS_BLEED = 0.002;

export function* script(p: AgentParams, rand: () => number, w: AgentWorld): Generator<Prim, void, void> {
  const logn = () => Math.exp((rand() + rand() + rand() - 1.5) * 0.8);
  const think = (sec: number): Prim => ({ t: 'wait', ms: Math.max(100, Math.round(sec * 1000 * p.latency * logn())) });
  const need = (step: Step, id: string, target: number) => {
    const v = w.view();
    return v.step === step && (v.progress[id] ?? 0) < target;
  };
  const P = w.points;

  function* tool(id: ToolId): Generator<Prim, void, void> {
    if (w.view().activeTool === id) return;
    yield think(0.4);
    yield { t: 'tool', id };
  }

  function* stopBleeding(reacting: boolean): Generator<Prim, void, void> {
    let guard = 0;
    if (reacting) yield { t: 'wait', ms: Math.round(p.reactMs * logn()) };
    while (w.view().bleeder && guard++ < 400) {
      const v = w.view();
      const at = v.bleeder!.pos;
      if (v.pool > 6 || rand() < 0.2 * (1 - p.skill)) {
        yield* tool('suction');
        yield { t: 'hold', target: 'brain', point: at, ms: 1200, fine: false };
      } else {
        yield* tool('bipolar');
        yield { t: 'hold', target: 'vessel', point: at, ms: 1500, fine: rand() < p.pFine };
      }
      yield think(0.3);
    }
  }

  function* recover(): Generator<Prim, void, void> {
    const b = w.view().bleeder;
    if (b && b.rate >= SERIOUS_BLEED) yield* stopBleeding(true);
  }

  function* act(prim: Prim): Generator<Prim, void, void> {
    yield prim;
    yield* recover();
  }

  function* distract(): Generator<Prim, void, void> {
    if (rand() >= p.wrongTool) return;
    const allowed = new Set(stepDef(w.view().step).allowedTools);
    const choices = TOOLS.filter((t) => !allowed.has(t));
    if (!choices.length) return;
    const id = choices[Math.floor(rand() * choices.length)]!;
    yield* tool(id);
    const mode = TOOL_DEFS[id].mode;
    if (mode === 'hold') yield* act({ t: 'hold', target: 'brain', point: P.brain, ms: 400, fine: rand() < p.pFine });
    else yield* act({ t: 'click', target: 'brain', point: P.brain, fine: rand() < p.pFine });
    yield think(0.5);
  }

  yield think(3);

  // 1 positioning and craniotomy
  yield* act({ t: 'confirm', itemId: 'head_position' });
  yield think(2);
  yield* act({ t: 'confirm', itemId: 'craniotomy' });
  yield think(1.5);
  yield* distract();

  // 2 dural opening
  for (let g = 0; need('dural_opening', 'dura_cut', 3) && g < 20; g++) {
    yield* tool('microscissors');
    const slip = rand() < p.err * 0.45;
    yield* act({ t: 'click', target: slip ? 'vessel' : 'brain', point: slip ? P.vessel : P.brain, fine: false });
    yield think(0.8);
  }
  for (let g = 0; need('dural_opening', 'dura_irrigate', 2) && g < 10; g++) {
    yield* tool('irrigation');
    const ms = 2400 + (rand() < p.overIrrigate ? 2600 : 0);
    yield* act({ t: 'hold', target: 'brain', point: P.brain, ms, fine: false });
    yield think(0.5);
  }
  yield* distract();

  // 3 Sylvian dissection
  for (let g = 0; need('sylvian_dissection', 'retract', 1) && g < 6; g++) {
    yield* tool('retractor');
    yield* act({ t: 'click', target: 'brain', point: P.brain, fine: false });
    yield think(0.6);
  }
  for (let g = 0; need('sylvian_dissection', 'dissect', 6) && g < 40; g++) {
    yield* tool('dissector');
    const slip = rand() < p.err * 0.3;
    const ms = Math.round(1500 + rand() * 1500);
    yield* act(
      slip
        ? { t: 'hold', target: 'sac', point: P.sac, ms, fine: rand() < p.pFine }
        : { t: 'hold', target: 'brain', point: P.brain, ms, fine: rand() < p.pFine },
    );
    yield think(0.5);
  }
  for (let g = 0; need('sylvian_dissection', 'clear', 2) && g < 10; g++) {
    yield* tool('suction');
    yield* act({ t: 'hold', target: 'brain', point: w.view().decals[0]?.pos ?? P.brain, ms: 1800, fine: rand() < p.pFine });
    yield think(0.4);
  }
  if (w.view().retractionOn && rand() < p.releaseProb) {
    yield* tool('retractor');
    yield* act({ t: 'click', target: 'brain', point: P.brain, fine: false });
    yield think(0.5);
  }
  yield* distract();

  // 4 neck and parent vessel exposure
  yield* stopBleeding(false);
  for (let g = 0; need('neck_parent_exposure', 'expose', 4) && g < 40; g++) {
    yield* tool('dissector');
    yield* act({ t: 'hold', target: 'sac', point: P.sac, ms: Math.round(1500 + rand() * 1000), fine: rand() < p.pFine });
    yield think(0.5);
  }
  for (let g = 0; need('neck_parent_exposure', 'baseline_flow', 1) && g < 4; g++) {
    yield* tool('doppler');
    yield* act({ t: 'hover', target: 'brain', point: P.brain, ms: 300 });
    yield* act({ t: 'hover', target: 'vessel', point: P.vessel, ms: 900 });
    yield think(0.5);
  }
  yield* distract();

  // 5 temporary and permanent clip
  for (let g = 0; need('clip_placement', 'temp_clip', 1) && g < 6; g++) {
    yield* tool('temporary_clip');
    const wrong = rand() < p.err * 0.4;
    yield* act({ t: 'click', target: wrong ? 'brain' : 'vessel', point: wrong ? P.brain : P.vessel, fine: false });
    yield think(0.8);
  }
  for (let g = 0; need('clip_placement', 'perm_clip', 1) && g < 6; g++) {
    yield* tool('clip_applier');
    const onVessel = rand() < p.err * 0.3;
    yield* act({
      t: 'click',
      target: onVessel ? 'vessel' : 'sac',
      point: onVessel ? P.vessel : P.sac,
      fine: rand() < p.pFine,
    });
    yield think(1);
  }
  for (let g = 0; need('clip_placement', 'release_temp', 1) && g < 6; g++) {
    yield* tool('temporary_clip');
    yield* act({ t: 'click', target: 'vessel', point: P.vessel, fine: false });
    yield think(0.6);
  }

  // 6 Doppler check and closure
  for (let g = 0; need('doppler_closure', 'flow_check', 1) && g < 4; g++) {
    yield* tool('doppler');
    yield* act({ t: 'hover', target: 'brain', point: P.brain, ms: 300 });
    yield* act({ t: 'hover', target: 'vessel', point: P.vessel, ms: 900 });
    yield think(0.5);
  }
  for (let g = 0; w.view().retractionOn && g < 4; g++) {
    yield* tool('retractor');
    yield* act({ t: 'click', target: 'brain', point: P.brain, fine: false });
    yield think(0.5);
  }
  yield* act({ t: 'confirm', itemId: 'closure' });
  yield think(1);
}
