import type { ToolId } from '@neuroclip/shared';
import type { Severity, TargetKind } from '../tools/toolDefs';

export type FactName =
  | 'hemostasis'
  | 'retract_on'
  | 'retract_off'
  | 'clamp_on'
  | 'clamp_off'
  | 'clip_placed'
  | 'doppler_flow'
  | 'doppler_clamped';

export type SimFact =
  | { type: 'USE'; tool: ToolId; target: TargetKind; fine: boolean; dtMs: number }
  | { type: 'FACT'; fact: FactName }
  | { type: 'FAILURE'; tool: ToolId; code: string; severity: Severity }
  | { type: 'ALARM'; code: string };

export const simHooks: { onFact?: (f: SimFact) => void } = {};
