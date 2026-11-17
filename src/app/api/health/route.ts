import { chromium } from "playwright";
import fs from "node:fs";
import { db } from "@/lib/db";
import { hasBinary } from "../../../../harness/scripts/ff";
import { harnessMode } from "@/lib/harness";

export async function GET() {
  let dbOk = false;
  try {
    db().prepare("SELECT 1").get();
    dbOk = true;
  } catch {}
  const [ffmpeg, ffprobe] = await Promise.all([hasBinary("ffmpeg"), hasBinary("ffprobe")]);
  let chromiumOk = false;
  try {
    chromiumOk = fs.existsSync(chromium.executablePath());
  } catch {}
  const ok = dbOk && ffmpeg && ffprobe && chromiumOk;
  return Response.json(
    { ok, db: dbOk, ffmpeg: ffmpeg && ffprobe, chromium: chromiumOk, harness_mode: harnessMode(), tts: process.env.TTS_PROVIDER || "none" },
    { status: ok ? 200 : 503 },
  );
}
