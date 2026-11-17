import { z } from "zod";

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
  contact: optionalText(100),
});
export type JobForm = z.infer<typeof JobFormSchema>;

export const ReviseSchema = z.object({ request: z.string().trim().min(2).max(300) });
export const FeedbackSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  quote: z.string().trim().max(400).optional(),
  can_quote: z.boolean().optional(),
});
