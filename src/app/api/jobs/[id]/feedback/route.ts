import { addFeedback, getJob } from "@/lib/db";
import { FeedbackSchema } from "@/lib/validate";
import { fail, json } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getJob(id)) return fail("Job not found", 404);
  const parsed = FeedbackSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Invalid feedback");
  addFeedback({ job_id: id, ...parsed.data });
  return json({ ok: true });
}
