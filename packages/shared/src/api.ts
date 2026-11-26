import { z } from 'zod';
import { ModeSchema, StepSchema } from './core';

export const PlayerOutSchema = z.object({ player_id: z.string().uuid(), token: z.string().min(1) });
export type PlayerOut = z.infer<typeof PlayerOutSchema>;

export const SessionOutSchema = z.object({ session_id: z.string().uuid() });
export type SessionOut = z.infer<typeof SessionOutSchema>;

export const TelemetryAckSchema = z.object({ accepted: z.number().int(), next_offset: z.number().int() });

export const BreakdownSchema = z.object({
  completion: z.number().int(),
  safety: z.number().int(),
  blood: z.number().int(),
  efficiency: z.number().int(),
});
export type Breakdown = z.infer<typeof BreakdownSchema>;

export const SummarySchema = z.object({
  duration_ms: z.number().int(),
  steps_completed: z.number().int(),
  timeline: z.array(
    z.object({
      step: StepSchema,
      start_ms: z.number().int(),
      duration_ms: z.number().int(),
      completed: z.boolean(),
    }),
  ),
  errors: z.array(
    z.object({
      t: z.number().int(),
      step: StepSchema.nullable(),
      tool: z.string().nullable(),
      code: z.string().nullable(),
      severity: z.string(),
    }),
  ),
  alarms: z.number().int(),
  ruptures: z.number().int(),
  blood_loss_ml: z.number(),
  max_icp: z.number(),
  min_sbp: z.number(),
});
export type Summary = z.infer<typeof SummarySchema>;

export const DebriefSchema = z.object({
  run_id: z.string().uuid(),
  mode: ModeSchema,
  status: z.string(),
  score: z.number().int(),
  breakdown: BreakdownSchema,
  summary: SummarySchema,
  flagged: z.boolean(),
  flags: z.array(z.string()),
  ml_skill: z.number().nullable(),
  rank: z.number().int().nullable(),
});
export type Debrief = z.infer<typeof DebriefSchema>;

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int(),
  display_name: z.string(),
  score: z.number().int(),
  duration_ms: z.number().int(),
  mode: ModeSchema,
  run_id: z.string().uuid(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const LeaderboardSchema = z.object({
  mode: ModeSchema.nullable(),
  entries: z.array(LeaderboardEntrySchema),
});

export const MentorAskSchema = z.object({
  question: z.string().trim().min(1).max(500),
  step: StepSchema.optional(),
});
export type MentorAsk = z.infer<typeof MentorAskSchema>;
