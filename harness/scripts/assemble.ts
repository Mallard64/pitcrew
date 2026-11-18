/**
 * Builds demo.mp4 from a recording (or screenshots) + narration.
 *
 * CLI: tsx harness/scripts/assemble.ts <out_dir> --title "<project_name>" --url "<url>" [--slideshow]
 * Inputs in out_dir: timings.json, script.json, audio/*.mp3, audio/durations.json,
 *                    and recording.webm (recording mode) or shots/*.png (slideshow mode)
 * Outputs: demo.mp4 (1280x720 H.264 + AAC, faststart), captions.srt, thumb.jpg
 * Prints the output contract JSON on stdout.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ScriptSchema } from "../schemas/script";
import type { Contract } from "../schemas/contract";
import type { StepTiming } from "./record_flow";
import type { SegmentAudio } from "./tts";
import { ffmpeg, probeDuration } from "./ff";
import { captionHtml, cardHtml, renderPngs, type PngJob } from "./render";

export type RenderMode = "recording" | "slideshow";

export type AssembleOptions = {
  outDir: string;
  title: string;
  url: string;
  mode?: RenderMode;
  log?: (m: string) => void;
};

const W = 1280;
const H = 720;
const FPS = 30;
const CARD_S = 2.5;
const AUDIO_LEAD_S = 0.3; // narration starts just after the step's action begins
const AUDIO_TAIL_S = 0.4; // breathing room before the next step
const MAX_CAPTION_WORDS = 9;

const VIDEO_ENC = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-r",
  String(FPS),
];
const AUDIO_ENC = ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"];

type Chunk = { text: string; start: number; end: number };

/** Splits narration into short caption chunks, timed proportionally to word count. */
export function captionChunks(text: string, start: number, duration: number): Chunk[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    const breakHere = /[.!?;:,]$/.test(w) && cur.length >= 4;
    if (cur.length >= MAX_CAPTION_WORDS || breakHere) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) {
    // Avoid a dangling one- or two-word caption.
    if (cur.length <= 2 && groups.length) groups[groups.length - 1].push(...cur);
    else groups.push(cur);
  }
  const perWord = duration / words.length;
  const chunks: Chunk[] = [];
  let t = start;
  for (const g of groups) {
    const d = g.length * perWord;
    chunks.push({ text: g.join(" "), start: t, end: t + d });
    t += d;
  }
  return chunks;
}

const srtTime = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function toSrt(chunks: Chunk[]) {
  return chunks
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}

async function cardClip(png: string, out: string) {
  await ffmpeg([
    "-loop",
    "1",
    "-framerate",
    String(FPS),
    "-i",
    png,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-vf",
    `scale=${W}:${H},setsar=1,fade=t=in:st=0:d=0.4,fade=t=out:st=${CARD_S - 0.4}:d=0.4`,
    "-t",
    String(CARD_S),
    ...VIDEO_ENC,
    ...AUDIO_ENC,
    out,
  ]);
}

type ClipSpec = {
  out: string;
  length: number;
  audio: string;
  captions: { png: string; start: number; end: number }[];
  source:
    | { kind: "recording"; file: string; start: number; windowLen: number }
    | { kind: "image"; file: string };
};

async function stepClip(spec: ClipSpec) {
  const args: string[] = [];
  let base: string;
  if (spec.source.kind === "recording") {
    args.push(
      "-ss",
      spec.source.start.toFixed(3),
      "-t",
      spec.source.windowLen.toFixed(3),
      "-i",
      spec.source.file,
    );
    const extra = Math.max(0, spec.length - spec.source.windowLen + 0.1);
    base =
      `[0:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
      `tpad=stop_mode=clone:stop_duration=${extra.toFixed(3)}[v0]`;
  } else {
    args.push("-loop", "1", "-framerate", String(FPS), "-i", spec.source.file);
    const frames = Math.ceil(spec.length * FPS) + 1;
    // Slow Ken Burns zoom 1.0 -> 1.06 so stills don't feel frozen.
    base =
      `[0:v]scale=${W * 2}:${H * 2},zoompan=z='min(1+0.06*on/${frames},1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},` +
      `setsar=1,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0, spec.length - 0.35).toFixed(3)}:d=0.35[v0]`;
  }
  args.push("-i", spec.audio);
  for (const c of spec.captions) args.push("-loop", "1", "-framerate", String(FPS), "-i", c.png);

  const filters = [base];
  let last = "v0";
  spec.captions.forEach((c, i) => {
    const label = `v${i + 1}`;
    filters.push(
      `[${last}][${i + 2}:v]overlay=0:0:enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'[${label}]`,
    );
    last = label;
  });
  const delayMs = Math.round(AUDIO_LEAD_S * 1000);
  filters.push(
    `[1:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs},apad[a]`,
  );

  await ffmpeg([
    ...args,
    "-filter_complex",
    filters.join(";"),
    "-map",
    `[${last}]`,
    "-map",
    "[a]",
    "-t",
    spec.length.toFixed(3),
    ...VIDEO_ENC,
    ...AUDIO_ENC,
    spec.out,
  ]);
}

export async function assembleVideo(opts: AssembleOptions): Promise<Contract> {
  const { outDir, title, url } = opts;
  const mode: RenderMode = opts.mode ?? "recording";
  const log = opts.log ?? (() => {});
  const work = path.join(outDir, ".assemble");
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(work, { recursive: true });

  const readJson = async <T>(f: string): Promise<T> =>
    JSON.parse(await fs.readFile(path.join(outDir, f), "utf8"));
  const script = ScriptSchema.parse(await readJson("script.json"));
  const timings = existsSync(path.join(outDir, "timings.json"))
    ? await readJson<StepTiming[]>("timings.json")
    : [];
  const durations = await readJson<SegmentAudio[]>("audio/durations.json");
  const durationOf = new Map(durations.map((d) => [d.step_id, d.duration_s]));
  const timingOf = new Map(timings.map((t) => [t.step_id, t]));

  // Which steps make the cut.
  const usable = script.segments.filter((seg) => {
    if (!durationOf.has(seg.step_id)) return false;
    if (mode === "slideshow") return existsSync(path.join(outDir, "shots", `${seg.step_id}.png`));
    const t = timingOf.get(seg.step_id);
    return !!t && t.ok;
  });
  const stepsTotal = script.segments.length;
  if (!usable.length) {
    return {
      status: "failed",
      render_mode: mode,
      duration_s: 0,
      steps_ok: 0,
      steps_total: stepsTotal,
      notes: "no usable steps to assemble",
    };
  }

  let recording = "";
  if (mode === "recording") {
    const webm = path.join(outDir, "recording.webm");
    if (!existsSync(webm)) throw new Error("recording.webm missing");
    // Normalise Playwright's variable-frame-rate webm once so per-step seeks are exact.
    recording = path.join(work, "rec.mp4");
    await ffmpeg([
      "-i",
      webm,
      "-vf",
      `fps=${FPS}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-an",
      recording,
    ]);
  }

  // Plan every clip and caption before rendering anything.
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const pngJobs: PngJob[] = [
    { html: cardHtml("title", title, host), out: path.join(work, "title.png") },
    {
      html: cardHtml("end", title, url.replace(/^https?:\/\//, "").replace(/\/$/, "")),
      out: path.join(work, "end.png"),
    },
  ];
  const clips: ClipSpec[] = [];
  const srtChunks: Chunk[] = [];
  let timeline = CARD_S;
  usable.forEach((seg, i) => {
    const audioLen = durationOf.get(seg.step_id)!;
    const narrated = audioLen + AUDIO_LEAD_S + AUDIO_TAIL_S;
    let length: number;
    let source: ClipSpec["source"];
    if (mode === "recording") {
      const t = timingOf.get(seg.step_id)!;
      const windowLen = Math.max(0.5, (t.end_ms - t.start_ms) / 1000);
      length = Math.max(windowLen, narrated);
      source = { kind: "recording", file: recording, start: t.start_ms / 1000, windowLen };
    } else {
      length = narrated + 0.5;
      source = { kind: "image", file: path.join(outDir, "shots", `${seg.step_id}.png`) };
    }
    const chunks = captionChunks(seg.text, AUDIO_LEAD_S, audioLen);
    const captions = chunks.map((c, j) => {
      const png = path.join(work, `cap_${i}_${j}.png`);
      pngJobs.push({ html: captionHtml(c.text), out: png, transparent: true });
      srtChunks.push({ text: c.text, start: timeline + c.start, end: timeline + c.end });
      return { png, start: c.start, end: c.end };
    });
    clips.push({
      out: path.join(work, `clip_${i}.mp4`),
      length,
      audio: path.join(outDir, "audio", `${seg.step_id}.mp3`),
      captions,
      source,
    });
    timeline += length;
  });

  log(`rendering ${pngJobs.length} cards/captions`);
  await renderPngs(pngJobs);

  const titleClip = path.join(work, "title.mp4");
  const endClip = path.join(work, "end.mp4");
  await cardClip(path.join(work, "title.png"), titleClip);
  await cardClip(path.join(work, "end.png"), endClip);
  for (const [i, c] of clips.entries()) {
    log(`encoding clip ${i + 1}/${clips.length}`);
    await stepClip(c);
  }

  const list = [titleClip, ...clips.map((c) => c.out), endClip]
    .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(path.join(work, "list.txt"), list);
  const concat = path.join(work, "concat.mp4");
  await ffmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    path.join(work, "list.txt"),
    "-c",
    "copy",
    concat,
  ]);

  const demo = path.join(outDir, "demo.mp4");
  await ffmpeg([
    "-i",
    concat,
    "-c:v",
    "copy",
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    ...AUDIO_ENC,
    "-movflags",
    "+faststart",
    demo,
  ]);
  await fs.writeFile(path.join(outDir, "captions.srt"), toSrt(srtChunks));
  await ffmpeg([
    "-ss",
    "3",
    "-i",
    demo,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    path.join(outDir, "thumb.jpg"),
  ]);
  await fs.rm(work, { recursive: true, force: true });

  const duration_s = Math.round((await probeDuration(demo)) * 10) / 10;
  const stepsOk = usable.length;
  const notes: string[] = [];
  if (stepsOk < stepsTotal) notes.push(`${stepsTotal - stepsOk} of ${stepsTotal} steps dropped`);
  if (duration_s < 45 || duration_s > 90) notes.push(`duration ${duration_s}s is outside 45-90s`);
  const status: Contract["status"] = stepsOk >= 3 && notes.length === 0 ? "ok" : "partial";
  return {
    status,
    render_mode: mode,
    duration_s,
    steps_ok: stepsOk,
    steps_total: stepsTotal,
    notes: notes.join("; "),
  };
}

export function parseCliArgs(argv: string[]) {
  const outDir = argv[0];
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    outDir,
    title: get("--title") ?? "Demo",
    url: get("--url") ?? "",
    slideshow: argv.includes("--slideshow"),
  };
}

async function main() {
  const a = parseCliArgs(process.argv.slice(2));
  if (!a.outDir) {
    console.error(
      'usage: tsx harness/scripts/assemble.ts <out_dir> --title "<name>" --url "<url>" [--slideshow]',
    );
    process.exit(1);
  }
  const contract = await assembleVideo({
    outDir: a.outDir,
    title: a.title,
    url: a.url,
    mode: a.slideshow ? "slideshow" : "recording",
    log: console.error,
  });
  console.log(JSON.stringify(contract));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
