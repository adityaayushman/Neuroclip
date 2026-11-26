import { STEPS, type Step, type ToolId } from '@neuroclip/shared';
import { ptr } from '../scene/pointerState';
import type { SimFact } from '../sim/events';
import { stepDef } from '../sim/steps';
import { useVitals } from '../sim/vitalsStore';
import { useSession } from '../state/session';
import { CLAMP_LIMIT_MS, RETRACTION_LIMIT_MS } from '../tools/toolDefs';
import { bleedRateOf, poolAround, useSim } from '../tools/toolSim';
import { buildSample, F, stepIndexOf } from './features';

/** Turns the live simulation state into one 10 Hz feature sample. */
export class Sampler {
  private errors = { warning: 0, injury: 0, rupture: 0 };
  private lastTool: ToolId | null = null;
  private switches = 0;

  noteFact(f: SimFact) {
    if (f.type !== 'FAILURE') return;
    if (f.severity === 'warning' || f.severity === 'injury' || f.severity === 'rupture') this.errors[f.severity] += 1;
  }

  reset() {
    this.errors = { warning: 0, injury: 0, rupture: 0 };
    this.lastTool = null;
    this.switches = 0;
  }

  sample(step: Step, stepElapsedMs: number, out = new Float32Array(F), offset = 0): Float32Array {
    const s = useSim.getState();
    if (this.lastTool !== null && this.lastTool !== s.activeTool) this.switches += 1;
    this.lastTool = s.activeTool;
    buildSample(
      {
        vitals: useVitals.getState().v,
        bleedRate: bleedRateOf(s.bleeder),
        pool: s.bleeder ? poolAround(s.decals, s.bleeder.pos) : 0,
        retractionLoad: s.retraction.on ? s.retraction.totalMs / RETRACTION_LIMIT_MS : 0,
        clampLoad: s.clamp.on ? s.clamp.totalMs / CLAMP_LIMIT_MS : 0,
        tool: s.activeTool,
        target: ptr.visible ? ptr.target : 'none',
        fine: useSession.getState().fine,
        down: ptr.down,
        errors: this.errors,
        switches: this.switches,
        stepIndex: stepIndexOf(step, STEPS),
        stepOverrun: stepElapsedMs / stepDef(step).softLimitMs,
      },
      out,
      offset,
    );
    this.errors = { warning: 0, injury: 0, rupture: 0 };
    this.switches = 0;
    return out;
  }
}
