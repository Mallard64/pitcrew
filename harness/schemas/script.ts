import { z } from "zod";

export const SegmentSchema = z.object({
  step_id: z.string().min(1),
  text: z.string(),
  /** Talking pace for this segment (1 = natural); see choosePace in src/lib/pacing.ts. */
  pace: z.number().min(0.6).max(1.5).optional(),
});
export const ScriptSchema = z.object({ segments: z.array(SegmentSchema) });

export type Segment = z.infer<typeof SegmentSchema>;
export type Script = z.infer<typeof ScriptSchema>;
