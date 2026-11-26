import type { Mode, Step, ToolId } from '@neuroclip/shared';
import type { Severity } from '../tools/toolDefs';
import { TOOL_DEFS } from '../tools/toolDefs';

export type MentorKind = 'hint' | 'error' | 'praise';
export interface MentorLine {
  id: number;
  text: string;
  kind: MentorKind;
  severity?: Severity;
  at: number;
}

export const STEP_INTRO: Record<Step, string> = {
  positioning_craniotomy:
    'Position the head with extension and rotation so the Sylvian fissure is the highest point, then complete the pterional craniotomy.',
  dural_opening: 'Open the dura in a curvilinear fashion with the microscissors. Irrigate to keep the cortex moist.',
  sylvian_dissection:
    'Split the Sylvian fissure from distal to proximal. Use light retraction, keep the field clear with suction.',
  neck_parent_exposure:
    'Control any bleeding first. Then expose the aneurysm neck and the parent vessel using fine mode, and confirm flow with the Doppler.',
  clip_placement:
    'Apply the temporary clip to the parent vessel, place the permanent clip across the neck in fine mode, then release the temporary clip.',
  doppler_closure: 'Check flow with the Doppler, release the retractor, then close dura and bone flap.',
};

export const ERROR_LINES: Record<string, string> = {
  suction_tissue_damage: 'Careful, suction is pulling on tissue. Keep it off vessel walls, or use fine mode.',
  bipolar_thermal_injury: 'That is thermal injury. Coagulate only the bleeder, never the sac, and keep bursts short.',
  vessel_nick: 'Stop. The scissors cut the vessel wall. Sharp dissection belongs on arachnoid only.',
  sac_dissection_tear: 'You tore the dome. Work gently around the sac and use fine mode.',
  over_retraction: 'Retraction time is too long. Release the retractor to protect the brain.',
  irrigation_overflow: 'Irrigation is pooling and hiding the field. Pause and clear it with suction.',
  cottonoid_sac_pressure: 'Do not press a cottonoid on the sac. Place it beside the aneurysm.',
  temp_clip_misplaced: 'The temporary clip goes on the parent vessel proximal to the aneurysm.',
  prolonged_clamp: 'The temporary clip has been on too long. Remove it to limit ischemia.',
  parent_vessel_occlusion: 'The clip is occluding the parent vessel. Reposition it across the neck only.',
  sac_clip_rupture: 'You crossed the sac too fast. Advance the clip slowly in fine mode.',
  clip_misplaced: 'That clip is not on the aneurysm neck. Reposition it.',
  sac_rupture: 'The aneurysm has ruptured!',
  doppler_no_signal: 'No signal. Place the probe on the vessel or the sac.',
};

export const RUPTURE_CUE = 'Suction to clear the field, then bipolar the bleeding point.';

export const ALARM_LINES: Record<string, string> = {
  hypotension: 'Blood pressure is dangerously low. Control the bleeding now.',
  hypertension: 'Blood pressure is very high. Tell anesthesia and check depth.',
  tachycardia: 'Heart rate is critically high. Look for bleeding or light anesthesia.',
  bradycardia: 'Heart rate is critically low. Check ICP and anesthesia depth.',
  hypoxia: 'Oxygen saturation is critically low. Ask anesthesia to check the airway.',
  icp_high: 'ICP is critically high. Release the retractor and the temporary clip.',
};

export const RISK_LINE =
  'Rupture risk is high right now. Slow down, use fine mode (Shift) near the sac and keep suction ready.';

export const SLOW_LINE = 'This step is taking longer than expected. Re-read the checklist and keep moving.';

export function wrongToolLine(stepTitle: string, tool: ToolId, allowed: ToolId[]): string {
  const names = allowed.map((t) => TOOL_DEFS[t].label).join(', ');
  return `${TOOL_DEFS[tool].label} is not used in "${stepTitle}". Use: ${names}.`;
}

export function mentorAudible(mode: Mode, kind: MentorKind, severity?: Severity): boolean {
  if (mode === 'expert') return kind === 'error' && severity === 'rupture';
  return true;
}
