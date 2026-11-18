import { getJob } from "@/lib/db";
import { ReviewSchema } from "@/lib/validate";
import { pendingReview, submitReview } from "@/lib/runner";
import { fail, json, readBody } from "@/lib/http";

/**
 * The team approves (optionally edits) the narration while the job waits in "review".
 * Like revise, the job link is the capability: anyone with the link can approve.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return fail("Job not found", 404);
  const draft = pendingReview(id);
  if (job.status !== "review" || !draft) return fail("This job isn't waiting for a review", 409);
  const parsed = ReviewSchema.safeParse(await readBody(req));
  if (!parsed.success) return fail("Each scene's narration must be 400 characters or less");
  const known = new Set(draft.scenes.map((s) => s.id));
  const edits = parsed.data.scenes.filter((s) => known.has(s.id));
  // Demo scenes need words to show their step; an emptied problem/solution line is allowed (it's dropped).
  const emptiedDemo = edits.find((e) => !e.narration.trim() && draft.scenes.find((s) => s.id === e.id)?.section === "demo");
  if (emptiedDemo) return fail("Demo scenes need narration (it describes the recorded step)");
  if (!submitReview(id, edits.length ? edits : null)) return fail("This job isn't waiting for a review", 409);
  return json({ ok: true });
}
