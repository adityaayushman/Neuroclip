import type { Step, ToolId } from '@neuroclip/shared';
import type { SimFact } from './events';

export interface World {
  retractorOn: boolean;
  clampOn: boolean;
}
export type Progress = Record<string, number>;

export interface ChecklistItem {
  id: string;
  label: string;
  target: number;
  confirm?: boolean;
  match?: (e: SimFact, p: Progress) => number;
  derived?: (w: World) => boolean;
}

export interface StepDef {
  id: Step;
  title: string;
  allowedTools: ToolId[];
  items: ChecklistItem[];
  softLimitMs: number;
}

const hold =
  (tool: ToolId, pred: (e: Extract<SimFact, { type: 'USE' }>) => boolean = () => true) =>
  (e: SimFact) =>
    e.type === 'USE' && e.tool === tool && pred(e) ? e.dtMs / 1000 : 0;
const click =
  (tool: ToolId, pred: (e: Extract<SimFact, { type: 'USE' }>) => boolean = () => true) =>
  (e: SimFact) =>
    e.type === 'USE' && e.tool === tool && pred(e) ? 1 : 0;
const fact =
  (name: string, needs?: (p: Progress) => boolean) =>
  (e: SimFact, p: Progress) =>
    e.type === 'FACT' && e.fact === name && (!needs || needs(p)) ? 1 : 0;

export const STEP_DEFS: StepDef[] = [
  {
    id: 'positioning_craniotomy',
    title: 'Positioning and craniotomy',
    allowedTools: ['irrigation', 'suction'],
    softLimitMs: 90_000,
    items: [
      { id: 'head_position', label: 'Position head (extension, rotation, pins)', target: 1, confirm: true },
      { id: 'craniotomy', label: 'Complete the pterional craniotomy', target: 1, confirm: true },
    ],
  },
  {
    id: 'dural_opening',
    title: 'Dural opening',
    allowedTools: ['microscissors', 'irrigation', 'cottonoid', 'suction', 'bipolar'],
    softLimitMs: 120_000,
    items: [
      { id: 'dura_cut', label: 'Open the dura with microscissors (3 cuts)', target: 3, match: click('microscissors', (e) => e.target === 'brain') },
      { id: 'dura_irrigate', label: 'Irrigate the field (2 s)', target: 2, match: hold('irrigation') },
    ],
  },
  {
    id: 'sylvian_dissection',
    title: 'Sylvian fissure dissection',
    allowedTools: ['suction', 'dissector', 'microscissors', 'retractor', 'irrigation', 'cottonoid', 'bipolar'],
    softLimitMs: 240_000,
    items: [
      { id: 'retract', label: 'Gently retract the frontal lobe', target: 1, match: fact('retract_on') },
      { id: 'dissect', label: 'Dissect the fissure with the dissector (6 s)', target: 6, match: hold('dissector', (e) => e.target === 'brain') },
      { id: 'clear', label: 'Keep the field clear with suction (2 s)', target: 2, match: hold('suction', (e) => e.target === 'brain') },
    ],
  },
  {
    id: 'neck_parent_exposure',
    title: 'Aneurysm neck and parent vessel exposure',
    allowedTools: ['suction', 'bipolar', 'dissector', 'irrigation', 'cottonoid', 'retractor', 'microscissors', 'doppler'],
    softLimitMs: 240_000,
    items: [
      { id: 'hemostasis', label: 'Control the bleeder with bipolar', target: 1, match: fact('hemostasis') },
      {
        id: 'expose',
        label: 'Expose the neck and parent vessel, fine mode (4 s)',
        target: 4,
        match: hold('dissector', (e) => e.fine && (e.target === 'vessel' || e.target === 'sac')),
      },
      { id: 'baseline_flow', label: 'Confirm baseline flow with the Doppler', target: 1, match: fact('doppler_flow') },
    ],
  },
  {
    id: 'clip_placement',
    title: 'Temporary and permanent clip placement',
    allowedTools: ['temporary_clip', 'clip_applier', 'suction', 'irrigation', 'cottonoid', 'bipolar', 'doppler', 'retractor'],
    softLimitMs: 180_000,
    items: [
      { id: 'temp_clip', label: 'Apply the temporary clip to the parent vessel', target: 1, match: fact('clamp_on') },
      { id: 'perm_clip', label: 'Place the permanent clip across the neck', target: 1, match: fact('clip_placed', (p) => (p.temp_clip ?? 0) >= 1) },
      { id: 'release_temp', label: 'Remove the temporary clip', target: 1, match: fact('clamp_off', (p) => (p.perm_clip ?? 0) >= 1) },
    ],
  },
  {
    id: 'doppler_closure',
    title: 'Doppler flow check and closure',
    allowedTools: ['doppler', 'irrigation', 'suction', 'retractor', 'cottonoid'],
    softLimitMs: 120_000,
    items: [
      { id: 'flow_check', label: 'Doppler: confirm flow in the parent vessel', target: 1, match: fact('doppler_flow') },
      { id: 'retractor_released', label: 'Release the retractor', target: 1, derived: (w) => !w.retractorOn },
      { id: 'closure', label: 'Close dura and bone flap', target: 1, confirm: true },
    ],
  },
];

export const stepDef = (id: Step): StepDef => STEP_DEFS.find((s) => s.id === id)!;

export const itemDone = (it: ChecklistItem, p: Progress, w: World) =>
  it.derived ? it.derived(w) : (p[it.id] ?? 0) >= it.target;
