/**
 * Team footage uploads (MP4/MOV, ≤ 500 MB, ≤ 3 min). Streamed to the container's temp disk, not the
 * small data volume; the pipeline transcodes the part it uses into the job folder. Unused uploads are
 * deleted after 3 hours.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { probeDuration } from "../../harness/scripts/ff";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_UPLOAD_SECONDS = 180;
const KEEP_MS = 3 * 60 * 60 * 1000;
const dir = () => path.join(os.tmpdir(), "pitcrew-uploads");
const EXT: Record<string, string> = { "video/mp4": ".mp4", "video/quicktime": ".mov" };

/** Path of an upload by id, or null if it doesn't exist (or expired). */
export function uploadPath(id: string): string | null {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  for (const ext of [".mp4", ".mov"]) {
    const p = path.join(dir(), id + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function sweep() {
  try {
    for (const f of fs.readdirSync(dir())) {
      const p = path.join(dir(), f);
      if (Date.now() - fs.statSync(p).mtimeMs > KEEP_MS) fs.rmSync(p, { force: true });
    }
  } catch {
    /* nothing to sweep */
  }
}

export class UploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Streams the request body to disk with a hard size cap, then checks it's a video ≤ 3 min. */
export async function saveUpload(body: ReadableStream<Uint8Array> | null, contentType: string, declaredBytes: number): Promise<{ id: string; duration_s: number; bytes: number }> {
  const ext = EXT[contentType.split(";")[0].trim().toLowerCase()];
  if (!ext) throw new UploadError("Upload an MP4 or MOV file");
  if (!body) throw new UploadError("Empty upload");
  if (declaredBytes > MAX_UPLOAD_BYTES) throw new UploadError("Footage must be 500 MB or less", 413);
  sweep();
  fs.mkdirSync(dir(), { recursive: true });
  const id = crypto.randomBytes(12).toString("base64url");
  const file = path.join(dir(), id + ext);
  let bytes = 0;
  const capped = Readable.fromWeb(body as never).on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_BYTES) capped.destroy(new UploadError("Footage must be 500 MB or less", 413));
  });
  try {
    await pipeline(capped, fs.createWriteStream(file));
    const duration_s = await probeDuration(file).catch(() => 0);
    if (!duration_s) throw new UploadError("That file doesn't look like a playable video");
    if (duration_s > MAX_UPLOAD_SECONDS + 1) throw new UploadError("Footage must be 3 minutes or shorter");
    return { id, duration_s: Math.round(duration_s * 10) / 10, bytes };
  } catch (e) {
    fs.rmSync(file, { force: true });
    throw e instanceof UploadError ? e : new UploadError("Upload failed; please try again", 500);
  }
}
