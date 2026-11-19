import { z } from "zod";

export const ContractSchema = z.object({
  status: z.enum(["ok", "partial", "failed"]),
  render_mode: z.enum(["recording", "slideshow", "remotion"]),
  duration_s: z.number().nonnegative(),
  steps_ok: z.number().int().nonnegative(),
  steps_total: z.number().int().nonnegative(),
  notes: z.string(),
  /** Where the demo came from: live, sandbox-run, cli-run, footage or repo-showcase. */
  demo_mode: z.enum(["live", "sandbox-run", "cli-run", "footage", "repo-showcase"]).optional(),
});

export type Contract = z.infer<typeof ContractSchema>;
