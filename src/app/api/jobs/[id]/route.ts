import { getJob, listArtifacts, publicJob } from "@/lib/db";
import { pendingReview, queuePosition } from "@/lib/runner";
import { fail, json } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return fail("Job not found", 404);
  return json({ job: publicJob(job), artifacts: listArtifacts(id, job.version).map((a) => ({ name: a.name, bytes: a.bytes, version: a.version })), queue_position: queuePosition(id), review: job.status === "review" ? pendingReview(id) : null });
}
