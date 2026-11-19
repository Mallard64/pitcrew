import { JobFormSchema } from "@/lib/validate";
import { checkPublicUrl } from "@/lib/ssrf";
import { clientKeyFor, takeJobSlot } from "@/lib/ratelimit";
import { createJob } from "@/lib/db";
import { enqueue } from "@/lib/runner";
import { clientIp, fail, json, readBody } from "@/lib/http";
import { uploadPath } from "@/lib/uploads";

export async function POST(req: Request) {
  const parsed = JobFormSchema.safeParse(await readBody(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const form = parsed.data;

  if (form.live_url) {
    const check = await checkPublicUrl(form.live_url);
    if (!check.ok) return fail(`Can't use that URL: ${check.reason}. It must be a public website.`);
  }
  if (form.footage && !uploadPath(form.footage)) return fail("That footage upload expired. Please upload it again.");

  const ipKey = clientKeyFor(clientIp(req));
  const keys = form.contact ? [ipKey, `contact:${form.contact.toLowerCase()}`] : [ipKey];
  const slot = takeJobSlot(keys);
  if (!slot.ok) return fail(slot.message, 429);

  const job = createJob({ ...form, client_key: ipKey });
  enqueue({ jobId: job.id });
  return json({ id: job.id }, 201);
}
