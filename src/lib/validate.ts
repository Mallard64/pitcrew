import { z } from "zod";
import { LOOK_IDS, VOICE_KEYS } from "./voices";
import { MAX_TARGET_S, MIN_TARGET_S } from "./pacing";

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
  // Target length in seconds, snapped to 15s steps; empty or "auto" keeps the default 60–90s.
  length_s: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === "" || v === "auto" ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= MIN_TARGET_S && v <= MAX_TARGET_S), `Length must be between ${MIN_TARGET_S} seconds and ${MAX_TARGET_S / 60} minutes`)
    .transform((v) => (v === undefined ? undefined : Math.round(v / 15) * 15)),
  closeups: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
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
