import { getJob, updateJob } from "@/lib/db";
import { config } from "@/lib/config";
import { enqueue } from "@/lib/runner";
import { fail, readBody } from "@/lib/http";

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!config.adminToken || body.token !== config.adminToken) return fail("Forbidden", 403);
  const job = getJob(String(body.id ?? ""));
  if (!job) return fail("Job not found", 404);
  if (job.status === "running" || job.status === "queued") return fail("Job is already running", 409);
  updateJob(job.id, { status: "queued", error: null, version: 0 });
  enqueue({ jobId: job.id });
  return Response.redirect(new URL(`/admin?token=${encodeURIComponent(config.adminToken)}`, req.url), 303);
}
