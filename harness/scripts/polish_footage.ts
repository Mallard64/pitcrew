/**
 * Cuts recording.mp4 into one clip per successful step and speeds up dead time.
 *
 * CLI: tsx harness/scripts/polish_footage.ts <out_dir>
 * Inputs: <out_dir>/recording.mp4, <out_dir>/timings.json (from record_flow.ts)
 * Outputs: <out_dir>/clips/<step_id>.mp4 (1920x1080, 30fps, H.264, no audio), <out_dir>/clips/manifest.json
 *
 * Dead time = a loading window the recorder saw in the DOM (spinner, progress bar, aria-busy,
 * skeleton) lasting over 1s. We don't use pixel stillness alone: the hold after each action is an
 * intentional still frame, and a pixel test can't tell it from a stall.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ffmpeg, probeDuration } from "./ff";
import type { Box, CursorPoint, StepTiming } from "./record_flow";

export const DEAD_MIN_S = 1;
export const SPEEDUP = 4; // max allowed by the spec

export type Speedup = { start_s: number; end_s: number; factor: number };
export type ClipInfo = {
  step_id: string;
  file: string;
  duration_s: number;
  raw_duration_s: number;
  box?: Box;
  /** Cursor path with t in seconds relative to the raw step window. */
  cursor?: { t: number; x: number; y: number }[];
  speedups: Speedup[];
};

const W = 1920;
const H = 1080;
const FPS = 30;

/** Splits a step window into normal and sped-up segments (seconds, relative to the window start). */
export function planSegments(t: StepTiming): { from: number; to: number; factor: number }[] {
  const len = (t.end_ms - t.start_ms) / 1000;
  const segs: { from: number; to: number; factor: number }[] = [];
  const w = t.wait;
  if (w && (w.end_ms - w.start_ms) / 1000 > DEAD_MIN_S) {
    const a = Math.max(0, (w.start_ms - t.start_ms) / 1000);
    const b = Math.min(len, (w.end_ms - t.start_ms) / 1000);
    if (a > 0.05) segs.push({ from: 0, to: a, factor: 1 });
    segs.push({ from: a, to: b, factor: SPEEDUP });
    if (len - b > 0.05) segs.push({ from: b, to: len, factor: 1 });
  } else {
    segs.push({ from: 0, to: len, factor: 1 });
  }
  return segs.filter((s) => s.to - s.from > 0.02);
}

export async function polishFootage(outDir: string, log: (m: string) => void = () => {}): Promise<ClipInfo[]> {
  const timings: StepTiming[] = JSON.parse(await fs.readFile(path.join(outDir, "timings.json"), "utf8"));
  const clipsDir = path.join(outDir, "clips");
  await fs.mkdir(clipsDir, { recursive: true });

  // Normalise Playwright's variable-frame-rate webm once so per-step seeks are exact.
  const cfr = path.join(clipsDir, ".rec.mp4");
  await ffmpeg(["-i", path.join(outDir, "recording.mp4"), "-vf", `fps=${FPS}`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", cfr]);
  const total = await probeDuration(cfr);

  const clips: ClipInfo[] = [];
  for (const t of timings.filter((x) => x.ok)) {
    const start = t.start_ms / 1000;
    const rawLen = Math.min((t.end_ms - t.start_ms) / 1000, total - start);
    if (rawLen <= 0.1) continue;
    const segs = planSegments({ ...t, end_ms: t.start_ms + rawLen * 1000 });
    const filters = segs.map(
      (s, i) => `[0:v]trim=start=${s.from.toFixed(3)}:end=${s.to.toFixed(3)},setpts=(PTS-STARTPTS)/${s.factor}[s${i}]`,
    );
    filters.push(
      `${segs.map((_, i) => `[s${i}]`).join("")}concat=n=${segs.length}:v=1:a=0,fps=${FPS},` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v]`,
    );
    const file = path.join(clipsDir, `${t.step_id}.mp4`);
    await ffmpeg([
      "-ss", start.toFixed(3), "-t", rawLen.toFixed(3), "-i", cfr,
      "-filter_complex", filters.join(";"), "-map", "[v]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", String(FPS), "-an", "-movflags", "+faststart", file,
    ]);
    const speedups = segs.filter((s) => s.factor > 1).map((s) => ({ start_s: +s.from.toFixed(3), end_s: +s.to.toFixed(3), factor: s.factor }));
    const info: ClipInfo = {
      step_id: t.step_id,
      file: `clips/${t.step_id}.mp4`,
      duration_s: Math.round((await probeDuration(file)) * 1000) / 1000,
      raw_duration_s: Math.round(rawLen * 1000) / 1000,
      speedups,
    };
    if (t.box) info.box = t.box;
    if (t.cursor?.length) info.cursor = t.cursor.map((c: CursorPoint) => ({ t: +((c.t - t.start_ms) / 1000).toFixed(3), x: c.x, y: c.y }));
    clips.push(info);
    log(`clip ${t.step_id}: ${info.raw_duration_s}s → ${info.duration_s}s${speedups.length ? ` (sped up ${SPEEDUP}x over ${(speedups[0].end_s - speedups[0].start_s).toFixed(1)}s of loading)` : ""}`);
  }
  await fs.rm(cfr, { force: true });
  await fs.writeFile(path.join(clipsDir, "manifest.json"), JSON.stringify(clips, null, 2));
  return clips;
}

async function main() {
  const [outDir] = process.argv.slice(2);
  if (!outDir) {
    console.error("usage: tsx harness/scripts/polish_footage.ts <out_dir>");
    process.exit(1);
  }
  const clips = await polishFootage(outDir, console.error);
  console.log(JSON.stringify({ clips: clips.length }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
