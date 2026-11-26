import { z } from 'zod';

export const MODES = ['guided', 'expert', 'emergency'] as const;
export const ModeSchema = z.enum(MODES);
export type Mode = z.infer<typeof ModeSchema>;

export const TOOLS = [
  'suction',
  'bipolar',
  'microscissors',
  'dissector',
  'retractor',
  'irrigation',
  'cottonoid',
  'temporary_clip',
  'clip_applier',
  'doppler',
] as const;
export const ToolIdSchema = z.enum(TOOLS);
export type ToolId = z.infer<typeof ToolIdSchema>;

export const STEPS = [
  'positioning_craniotomy',
  'dural_opening',
  'sylvian_dissection',
  'neck_parent_exposure',
  'clip_placement',
  'doppler_closure',
] as const;
export const StepSchema = z.enum(STEPS);
export type Step = z.infer<typeof StepSchema>;

export const TelemetryEventSchema = z.object({
  t: z.number().nonnegative(),
  step: StepSchema,
  tool: ToolIdSchema.nullable(),
  kind: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const toolForKey = (key: string): ToolId | undefined => {
  const i = key === '0' ? 9 : Number(key) - 1;
  return Number.isInteger(i) ? TOOLS[i] : undefined;
};
