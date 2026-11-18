/**
 * Renders demo.mp4 from video_plan.json with Remotion.
 *
 * CLI: tsx harness/scripts/render_video.ts <out_dir>
 * Inputs in out_dir: video_plan.json, optional clips/manifest.json + clips/*.mp4 (C17), shots/*.png
 * Outputs: demo.mp4 (H.264 CRF 23 + AAC, faststart), thumb.jpg. Prints the output contract.
 * Exit 3 on any render failure so the caller can fall back to the ffmpeg slideshow (C4).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { VideoPlanSchema, type VideoPlan } from "../schemas/video_plan";
import type { Contract } from "../schemas/contract";
import { ffmpeg, probeDuration } from "./ff";
import { resolveKit } from "../../remotion/kits/default";
import type { PitchVideoProps } from "../../remotion/types";

// Resolved from the working directory: inside a Next.js server chunk, __dirname is not the repo.
const ENTRY = path.resolve(/* turbopackIgnore: true */ process.env.REMOTION_ENTRY || path.join(process.cwd(), "remotion/index.ts"));
let bundlePromise: Promise<string> | null = null;

/** Webpack bundle of the Remotion project, built once per process (or prebuilt into the image: REMOTION_BUNDLE). */
export function getBundle(): Promise<string> {
  if (process.env.REMOTION_BUNDLE) return Promise.resolve(path.resolve(/* turbopackIgnore: true */ process.env.REMOTION_BUNDLE));
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY,
      outDir: path.join(os.tmpdir(), `pitcrew-remotion-${process.pid}`),
      enableCaching: true,
    }).catch((e) => {
      bundlePromise = null;
      throw e;
    });
  }
  return bundlePromise;
}

const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

/** Serves one directory read-only on 127.0.0.1 so the headless renderer can load job media. */
export function serveDir(root: string): Promise<{ base: string; close: () => Promise<void> }> {
  const realRoot = fs.realpathSync(root);
  const server = http.createServer((req, res) => {
    let file: string;
    try {
      file = fs.realpathSync(path.join(realRoot, decodeURIComponent((req.url ?? "/").split("?")[0])));
    } catch {
      return void res.writeHead(404).end();
    }
    if (!file.startsWith(realRoot + path.sep) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
    const size = fs.statSync(file).size;
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    const m = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (m) {
      const start = m[1] ? +m[1] : size - +m[2];
      const end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
      return void fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    }),
  );
}

export async function mediaFor(outDir: string, base: string): Promise<PitchVideoProps["media"]> {
  const media: PitchVideoProps["media"] = { clips: {}, images: {}, audio: {} };
  const durations = path.join(outDir, "audio", "durations.json");
  if (fs.existsSync(durations)) {
    for (const d of JSON.parse(await fsp.readFile(durations, "utf8")) as { step_id: string; duration_s: number }[])
      media.audio[d.step_id] = { url: `${base}/audio/${d.step_id}.mp3`, duration_s: d.duration_s };
  }
  const manifest = path.join(outDir, "clips", "manifest.json");
  if (fs.existsSync(manifest)) {
    const clips = JSON.parse(await fsp.readFile(manifest, "utf8")) as { step_id: string; file: string; duration_s: number; box?: { x: number; y: number; w: number; h: number } }[];
    for (const c of clips) media.clips[c.step_id] = { url: `${base}/${c.file}`, duration_s: c.duration_s, box: c.box };
  }
  const shots = path.join(outDir, "shots");
  if (fs.existsSync(shots)) for (const f of await fsp.readdir(shots)) media.images[`shots/${f}`] = `${base}/shots/${f}`;
  return media;
}

const OUTPUT_SCALE = Number(process.env.RENDER_SCALE) || 1.5;
/** 60fps output makes zooms, springs and cursor moves smooth. RENDER_FPS=30 halves render time. */
const outputFps = (): 30 | 60 => (process.env.RENDER_FPS === "30" ? 30 : 60);

export async function renderVideo(outDir: string, log: (m: string) => void = () => {}): Promise<Contract & { seed: number; style_kit: string }> {
  const plan: VideoPlan = VideoPlanSchema.parse(JSON.parse(await fsp.readFile(path.join(outDir, "video_plan.json"), "utf8")));
  plan.fps = outputFps();
  const server = await serveDir(outDir);
  try {
    const inputProps = { plan, media: await mediaFor(outDir, server.base) } satisfies PitchVideoProps;
    log("bundling renderer");
    const serveUrl = await getBundle();
    const composition = await selectComposition({ serveUrl, id: "PitchVideo", inputProps });
    const demo = path.join(outDir, "demo.mp4");
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      // Compose in 1280x720 coordinates, output 1080p: text and shapes render crisp at full size.
      scale: OUTPUT_SCALE,
      // Frames are captured as near-lossless JPEG (Remotion's default 80 visibly softens screenshots).
      imageFormat: "jpeg",
      jpegQuality: 98,
      crf: 15,
      x264Preset: "medium",
      audioCodec: "aac",
      enforceAudioTrack: true,
      outputLocation: demo,
      inputProps,
      // os.cpus() reports the host inside containers; RENDER_CONCURRENCY caps it to the plan's real size.
      concurrency: Number(process.env.RENDER_CONCURRENCY) || Math.max(1, Math.min(8, os.cpus().length - 1)),
      // Small containers render a frame far slower than a laptop; Remotion's 30s default per frame is too tight.
      timeoutInMilliseconds: Number(process.env.RENDER_FRAME_TIMEOUT_MS) || 30_000,
      // The frame cache otherwise sizes itself from total memory; cap it where memory is tight.
      ...(process.env.OFFTHREAD_CACHE_MB ? { offthreadVideoCacheSizeInBytes: Number(process.env.OFFTHREAD_CACHE_MB) * 1024 * 1024 } : {}),
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10) * 10;
        if (pct !== last) log(`rendering ${pct}%`);
        last = pct;
      },
    });
    // Remotion writes faststart-less mp4s by default; move the index up front for web playback.
    const fast = path.join(outDir, ".demo.fast.mp4");
    await ffmpeg(["-i", demo, "-c", "copy", "-movflags", "+faststart", fast]);
    await fsp.rename(fast, demo);
    await ffmpeg(["-ss", "3", "-i", demo, "-frames:v", "1", "-q:v", "3", path.join(outDir, "thumb.jpg")]).catch(() => ffmpeg(["-i", demo, "-frames:v", "1", "-q:v", "3", path.join(outDir, "thumb.jpg")]));
    const duration_s = Math.round((await probeDuration(demo)) * 10) / 10;
    const demoSteps = plan.scenes.flatMap((s) => s.elements).filter((e) => e.type === "clip").length;
    const notes = duration_s < 60 || duration_s > 90 ? `duration ${duration_s}s is outside 60-90s` : "";
    return {
      status: notes ? "partial" : "ok",
      render_mode: "remotion" as Contract["render_mode"],
      duration_s,
      steps_ok: demoSteps,
      steps_total: plan.flow.steps.length,
      notes,
      seed: plan.seed,
      // Report the kit actually rendered ("default" or an unknown id resolves by seed).
      style_kit: resolveKit(plan.style_kit, plan.seed, plan.brand.primary).id,
    };
  } finally {
    await server.close();
  }
}

async function main() {
  const [outDir] = process.argv.slice(2);
  if (!outDir) {
    console.error("usage: tsx harness/scripts/render_video.ts <out_dir>");
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(await renderVideo(outDir, console.error)));
  } catch (e) {
    console.error(e);
    process.exit(3);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
