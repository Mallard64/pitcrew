import { z } from "zod";
import { LOOK_IDS, VOICE_KEYS } from "./voices";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const JobFormSchema = z.object({
  project_name: z.string().trim().min(1, "Project name is required").max(80),
  live_url: z
    .string()
    .trim()
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url("Enter a valid URL").refine((v) => /^https?:\/\//i.test(v), "Only http(s) URLs")),
  repo_url: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, "").replace(/\.git$/, "") : undefined))
    .refine((v) => !v || /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(v), "Repo must look like https://github.com/owner/repo"),
  blurb: optionalText(300),
  problem: optionalText(300),
  whats_next: optionalText(300),
  contact: optionalText(100),
  voice: z.string().optional().transform((v) => (v && (VOICE_KEYS as string[]).includes(v) ? v : undefined)),
  look: z.string().optional().transform((v) => (v && LOOK_IDS.includes(v) ? v : undefined)),
  // Checkbox: "on" from a form post, true from JSON.
  review_script: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
});
export type JobForm = z.infer<typeof JobFormSchema>;

export const ReviseSchema = z.object({
  request: z.string().trim().min(2).max(300),
  voice: z.string().optional().transform((v) => (v && (VOICE_KEYS as string[]).includes(v) ? v : undefined)),
});
/** Script review: the team's edited narration per scene (ids must exist in the draft). */
export const ReviewSchema = z.object({
  scenes: z.array(z.object({ id: z.string().min(1).max(40), narration: z.string().max(400) })).max(20),
});
export const FeedbackSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  quote: z.string().trim().max(400).optional(),
  can_quote: z.boolean().optional(),
});
