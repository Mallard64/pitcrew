import { z } from "zod";

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const StepSchema = z
  .object({
    id: z.string().min(1).max(40),
    action: z.enum(["goto", "click", "type", "scroll", "wait"]),
    url: z.string().url().optional(),
    selector: z.string().min(1).optional(),
    text: z.string().max(200).optional(),
    y: z.number().int().optional(),
    hold_ms: z.number().int().min(1000).max(8000),
    say: z.string().refine((s) => wordCount(s) <= 25, "say must be 25 words or fewer"),
    /** Selector whose bounding box the camera zooms to (C17); defaults to the action selector. */
    zoom: z.string().min(1).nullable().optional(),
  })
  .superRefine((s, ctx) => {
    if (s.action === "goto" && !s.url) ctx.addIssue({ code: "custom", message: "goto needs url" });
    if ((s.action === "click" || s.action === "type") && !s.selector)
      ctx.addIssue({ code: "custom", message: `${s.action} needs selector` });
    if (s.action === "type" && s.text === undefined)
      ctx.addIssue({ code: "custom", message: "type needs text" });
  });

export const FlowSchema = z.object({
  project_name: z.string().min(1).max(80),
  url: z.string().url(),
  viewport: z.object({ width: z.literal(1280), height: z.literal(720) }),
  steps: z.array(StepSchema).min(1).max(12),
});

export type Step = z.infer<typeof StepSchema>;
export type Flow = z.infer<typeof FlowSchema>;
