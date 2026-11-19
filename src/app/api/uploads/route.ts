import { clientKeyFor } from "@/lib/ratelimit";
import { countRateEvents, recordRateEvent } from "@/lib/db";
import { clientIp, fail, json } from "@/lib/http";
import { saveUpload, UploadError } from "@/lib/uploads";

/** Raw-body upload of the team's footage: POST with Content-Type video/mp4 or video/quicktime. */
export async function POST(req: Request) {
  const key = `upload:${clientKeyFor(clientIp(req))}`;
  // A few uploads per visitor per hour keeps the temp disk safe.
  if (countRateEvents(key, Date.now() - 60 * 60 * 1000) >= 6)
    return fail("Too many uploads in the last hour; try again later", 429);
  recordRateEvent(key);
  try {
    const up = await saveUpload(
      req.body,
      req.headers.get("content-type") ?? "",
      Number(req.headers.get("content-length") ?? 0),
    );
    return json(up, 201);
  } catch (e) {
    const err =
      e instanceof UploadError ? e : new UploadError("Upload failed; please try again", 500);
    return fail(err.message, err.status);
  }
}
