/** Small wrappers around the ffmpeg / ffprobe binaries (must be on PATH). */
import { spawn } from "node:child_process";

export function run(cmd: string, args: string[], timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code ?? signal}: ${err.slice(-1500)}`));
    });
  });
}

/** Containers report the host's cores; x264 sizes its threads (and frame buffers) from that. FFMPEG_THREADS caps it. */
const threadArgs = () => (process.env.FFMPEG_THREADS ? ["-threads", process.env.FFMPEG_THREADS] : []);

export const ffmpeg = (args: string[], timeoutMs?: number) =>
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args.slice(0, -1), ...threadArgs(), ...args.slice(-1)], timeoutMs);

export async function probeDuration(file: string): Promise<number> {
  const out = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ]);
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d)) throw new Error(`ffprobe: no duration for ${file}`);
  return d;
}

export type StreamInfo = { codec_type: string; codec_name: string; width?: number; height?: number };

export async function probeStreams(file: string): Promise<StreamInfo[]> {
  const out = await run("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", file,
  ]);
  return JSON.parse(out).streams ?? [];
}

export async function hasBinary(name: string): Promise<boolean> {
  try {
    await run(name, ["-version"], 10_000);
    return true;
  } catch {
    return false;
  }
}
