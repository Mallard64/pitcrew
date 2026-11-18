import fs from "node:fs";
import { Readable } from "node:stream";
import { getJob, listArtifacts } from "@/lib/db";
import { fail } from "@/lib/http";

const TYPES: Record<string, string> = {
  "demo.mp4": "video/mp4",
  "captions.srt": "application/x-subrip; charset=utf-8",
  "script.md": "text/markdown; charset=utf-8",
  "build_log.md": "text/markdown; charset=utf-8",
  "flow.json": "application/json",
  "thumb.jpg": "image/jpeg",
  "submission.md": "text/markdown; charset=utf-8",
  "sources.md": "text/markdown; charset=utf-8",
  "video_plan.json": "application/json",
};

/** Serves a job artifact; supports Range requests so the video can seek. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await ctx.params;
  const job = getJob(id);
  if (!job || !TYPES[name]) return fail("Not found", 404);
  const v = Number(new URL(req.url).searchParams.get("v")) || job.version;
  const art = listArtifacts(id, v).find((a) => a.name === name);
  if (!art || !fs.existsSync(art.path)) return fail("Not found", 404);

  const size = fs.statSync(art.path).size;
  const download = new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": TYPES[name],
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${job.project_name.replace(/[^\w.-]+/g, "-").slice(0, 40)}-${name}"`,
  };
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    let start = range[1] ? parseInt(range[1], 10) : size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const body = Readable.toWeb(fs.createReadStream(art.path, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const body = Readable.toWeb(fs.createReadStream(art.path)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
