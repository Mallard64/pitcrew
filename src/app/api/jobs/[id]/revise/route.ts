import { getJob } from "@/lib/db";
import { ReviseSchema } from "@/lib/validate";
import { clientKeyFor, takeJobSlot } from "@/lib/ratelimit";
import { enqueue } from "@/lib/runner";
import { clientIp, fail, json, readBody } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return fail("Job not found", 404);
  if (job.status !== "ok" && job.status !== "partial") return fail("You can revise once the first video is ready", 409);
  const parsed = ReviseSchema.safeParse(await readBody(req));
  if (!parsed.success) return fail("Describe the change in a few words");
  const slot = takeJobSlot([clientKeyFor(clientIp(req))]);
  if (!slot.ok) return fail(slot.message, 429);
  if (!enqueue({ jobId: id, revision: parsed.data.request })) return fail("A new version is already being made", 409);
  return json({ id, version: job.version + 1 }, 202);
}
