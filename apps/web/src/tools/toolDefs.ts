import { TOOLS, type ToolId } from '@neuroclip/shared';

export type TargetKind = 'brain' | 'vessel' | 'sac' | 'none';
export type EffectKind =
  | 'clear_blood'
  | 'coagulate'
  | 'cut'
  | 'dissect'
  | 'retract'
  | 'irrigate'
  | 'absorb'
  | 'clamp_temp'
  | 'clip_perm'
  | 'doppler';
export type UseMode = 'hold' | 'click' | 'hover';
export type Severity = 'info' | 'warning' | 'injury' | 'rupture';

export interface UseContext {
  target: TargetKind;
  fine: boolean;
  heldMs: number;
  retractionMs: number;
  clampMs: number;
  bleeding: boolean;
}

export interface Failure {
  code: string;
  message: string;
  severity: Severity;
}

export interface ToolDef {
  id: ToolId;
  key: string;
  label: string;
  cursor: string;
  mode: UseMode;
  effect: EffectKind;
  failure: (ctx: UseContext) => Failure | null;
}

export const RETRACTION_LIMIT_MS = 90_000;
export const CLAMP_LIMIT_MS = 180_000;

const onWall = (t: TargetKind) => t === 'vessel' || t === 'sac';
const fail = (code: string, severity: Severity, message: string): Failure => ({ code, severity, message });

const defs: ToolDef[] = [
  {
    id: 'suction', key: '1', label: 'Suction', cursor: 'cell', mode: 'hold', effect: 'clear_blood',
    failure: (c) =>
      (onWall(c.target) && !c.fine) || (c.target === 'brain' && c.heldMs > 2500)
        ? fail('suction_tissue_damage', 'injury', 'Suction is damaging tissue. Lower the tip or use fine mode near vessels.')
        : null,
  },
  {
    id: 'bipolar', key: '2', label: 'Bipolar', cursor: 'crosshair', mode: 'hold', effect: 'coagulate',
    failure: (c) =>
      c.target === 'sac' ||
      (c.target === 'vessel' && !c.bleeding && c.heldMs > 1500) ||
      (c.target === 'brain' && c.heldMs > 3000)
        ? fail('bipolar_thermal_injury', 'injury', 'Thermal injury. Coagulate only the bleeder, never the sac.')
        : null,
  },
  {
    id: 'microscissors', key: '3', label: 'Scissors', cursor: 'crosshair', mode: 'click', effect: 'cut',
    failure: (c) =>
      onWall(c.target) ? fail('vessel_nick', 'rupture', 'Vessel wall cut. Scissors belong on arachnoid only.') : null,
  },
  {
    id: 'dissector', key: '4', label: 'Dissector', cursor: 'crosshair', mode: 'hold', effect: 'dissect',
    failure: (c) =>
      c.target === 'sac' && !c.fine
        ? fail('sac_dissection_tear', 'rupture', 'Dissecting the sac too coarsely tore the dome.')
        : null,
  },
  {
    id: 'retractor', key: '5', label: 'Retractor', cursor: 'grab', mode: 'click', effect: 'retract',
    failure: (c) =>
      c.retractionMs > RETRACTION_LIMIT_MS
        ? fail('over_retraction', 'injury', 'Prolonged retraction. Release the retractor to avoid brain injury.')
        : null,
  },
  {
    id: 'irrigation', key: '6', label: 'Irrigation', cursor: 'cell', mode: 'hold', effect: 'irrigate',
    failure: (c) =>
      c.heldMs > 4000 ? fail('irrigation_overflow', 'warning', 'Irrigation is pooling and obscuring the field.') : null,
  },
  {
    id: 'cottonoid', key: '7', label: 'Cottonoid', cursor: 'copy', mode: 'hold', effect: 'absorb',
    failure: (c) =>
      c.target === 'sac' && !c.fine
        ? fail('cottonoid_sac_pressure', 'rupture', 'Pressing a cottonoid on the sac risks rupture.')
        : null,
  },
  {
    id: 'temporary_clip', key: '8', label: 'Temp clip', cursor: 'pointer', mode: 'click', effect: 'clamp_temp',
    failure: (c) =>
      c.clampMs > CLAMP_LIMIT_MS
        ? fail('prolonged_clamp', 'injury', 'Temporary clip on too long. Risk of ischemia, remove it.')
        : c.target !== 'vessel'
          ? fail('temp_clip_misplaced', 'warning', 'Temporary clip must go on the parent vessel.')
          : null,
  },
  {
    id: 'clip_applier', key: '9', label: 'Clip applier', cursor: 'pointer', mode: 'click', effect: 'clip_perm',
    failure: (c) =>
      c.target === 'vessel'
        ? fail('parent_vessel_occlusion', 'injury', 'Clip is occluding the parent vessel.')
        : c.target === 'sac' && !c.fine
          ? fail('sac_clip_rupture', 'rupture', 'Clip crossed the sac too fast. Use fine mode at the neck.')
          : c.target !== 'sac'
            ? fail('clip_misplaced', 'warning', 'Clip is not on the aneurysm neck.')
            : null,
  },
  {
    id: 'doppler', key: '0', label: 'Doppler', cursor: 'help', mode: 'hover', effect: 'doppler',
    failure: (c) =>
      onWall(c.target) ? null : fail('doppler_no_signal', 'warning', 'No signal. Place the probe on a vessel or the sac.'),
  },
];

export const TOOL_DEFS = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<ToolId, ToolDef>;
export const TOOL_LIST: ToolDef[] = TOOLS.map((id) => TOOL_DEFS[id]);
