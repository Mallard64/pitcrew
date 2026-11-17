import { z } from "zod";

export const SegmentSchema = z.object({ step_id: z.string().min(1), text: z.string() });
export const ScriptSchema = z.object({ segments: z.array(SegmentSchema) });

export type Segment = z.infer<typeof SegmentSchema>;
export type Script = z.infer<typeof ScriptSchema>;
