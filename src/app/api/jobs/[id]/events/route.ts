import { getJob, listEvents, type JobEvent } from "@/lib/db";
import { subscribe } from "@/lib/runner";
import { fail } from "@/lib/http";

const FINAL = new Set(["ok", "partial", "failed"]);

/** SSE: replays stored events after Last-Event-ID, then streams live ones until the job finishes. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return fail("Job not found", 404);
  const after = Number(req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("after") ?? 0) || 0;
  const enc = new TextEncoder();

  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastId = after;
      const send = (e: JobEvent) => {
        if (closed || e.id <= lastId) return;
        lastId = e.id;
        controller.enqueue(enc.encode(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`));
        if (e.kind === "status" && FINAL.has(e.message)) close();
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        controller.close();
      };
      const unsub = subscribe(id, send);
      const ping = setInterval(() => !closed && controller.enqueue(enc.encode(`: ping\n\n`)), 15000);
      cleanup = () => {
        unsub();
        clearInterval(ping);
      };
      controller.enqueue(enc.encode(`retry: 3000\n\n`));
      for (const e of listEvents(id, after)) send(e);
      // Already finished before we connected and nothing new to replay.
      const now = getJob(id);
      if (now && FINAL.has(now.status) && !closed && lastId === after) {
        controller.enqueue(enc.encode(`event: done\ndata: ${JSON.stringify({ status: now.status })}\n\n`));
        close();
      }
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
