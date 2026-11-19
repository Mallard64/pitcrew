/**
 * Team footage → demo clips. Finds dead time (freezedetect) and scene changes, keeps the moving parts,
 * splits them into 2–10 s clips at scene changes, and picks the strongest ones up to ~60 s (clips with
 * more scene changes first, then in original order). Writes clips/f1.mp4…, clips/manifest.json (same
 * shape as polish_footage) and shots/f1.png (a middle frame, also shown to the agent).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ffmpeg, probeDuration, run } from "./ff";
import type { ClipInfo } from "./polish_footage";

export type Segment = { from: number; to: number; cuts: number };

/** Scene-change times (s), from ffmpeg's scene score. */
async function sceneCuts(src: string): Promise<number[]> {
  const out = await run("ffmpeg", ["-hide_banner", "-i", src, "-vf", "select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"], 300_000).catch((e: Error) => e.message);
  return [...String(out).matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Still stretches ≥ 1.5 s (loading screens, idle menus). */
async function freezes(src: string): Promise<{ from: number; to: number }[]> {
  const out = await run("ffmpeg", ["-hide_banner", "-i", src, "-vf", "freezedetect=n=0.003:d=1.5", "-an", "-f", "null", "-"], 300_000).catch((e: Error) => e.message);
  const starts = [...String(out).matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...String(out).matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => ({ from: s, to: ends[i] ?? Infinity }));
}

/** Pure: active spans split at scene changes into 2–10 s segments, best first up to `budget` seconds. */
export function chooseSegments(duration: number, cuts: number[], still: { from: number; to: number }[], budget = 60): Segment[] {
  let active = [{ from: 0, to: duration }];
  for (const f of still)
    active = active.flatMap((a) => (f.to <= a.from || f.from >= a.to ? [a] : [{ from: a.from, to: Math.max(a.from, f.from) }, { from: Math.min(a.to, f.to), to: a.to }]));
  active = active.filter((a) => a.to - a.from >= 1.5);
  const segs: Segment[] = [];
  for (const a of active) {
    const inner = cuts.filter((c) => c > a.from + 2 && c < a.to - 2);
    let start = a.from;
    for (const c of [...inner, a.to]) {
      while (c - start > 10) {
        segs.push({ from: start, to: start + 8, cuts: 0 });
        start += 8;
      }
      if (c - start >= 1.5) segs.push({ from: start, to: c, cuts: 0 });
      start = c;
    }
  }
  for (const s of segs) s.cuts = cuts.filter((c) => c >= s.from && c < s.to).length;
  const ranked = [...segs].sort((x, y) => y.cuts - x.cuts || x.from - y.from);
  const picked: Segment[] = [];
  let total = 0;
  for (const s of ranked) {
    if (total >= budget) break;
    picked.push(s);
    total += s.to - s.from;
  }
  return picked.sort((x, y) => x.from - y.from);
}

export async function prepareFootage(src: string, outDir: string, budget = 60, log: (m: string) => void = () => {}): Promise<ClipInfo[]> {
  const duration = await probeDuration(src);
  const [cuts, still] = await Promise.all([sceneCuts(src), freezes(src)]);
  let segs = chooseSegments(duration, cuts, still, budget);
  if (!segs.length) segs = [{ from: 0, to: Math.min(duration, budget), cuts: 0 }];
  const clipsDir = path.join(outDir, "clips");
  const shotsDir = path.join(outDir, "shots");
  await fs.mkdir(clipsDir, { recursive: true });
  await fs.mkdir(shotsDir, { recursive: true });
  const clips: ClipInfo[] = [];
  for (const [i, s] of segs.entries()) {
    const id = `f${i + 1}`;
    const file = path.join(clipsDir, `${id}.mp4`);
    // Keep the footage's own aspect ratio (the renderer letterboxes); cap at 1920x1080.
    await ffmpeg([
      "-ss", s.from.toFixed(3), "-t", (s.to - s.from).toFixed(3), "-i", src,
      "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=60,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", "-movflags", "+faststart", file,
    ]);
    await ffmpeg(["-ss", ((s.to - s.from) / 2).toFixed(3), "-i", file, "-frames:v", "1", path.join(shotsDir, `${id}.png`)]);
    const len = Math.round((await probeDuration(file)) * 1000) / 1000;
    clips.push({ step_id: id, file: `clips/${id}.mp4`, duration_s: len, raw_duration_s: Math.round((s.to - s.from) * 1000) / 1000, speedups: [] });
    log(`Footage clip ${id}: ${s.from.toFixed(1)}–${s.to.toFixed(1)} s`);
  }
  const deadCut = still.reduce((n, f) => n + Math.min(duration, f.to) - f.from, 0);
  if (deadCut >= 1) log(`Cut ${deadCut.toFixed(1)} s of still footage`);
  await fs.writeFile(path.join(clipsDir, "manifest.json"), JSON.stringify(clips, null, 2));
  return clips;
}
