/** Small wrappers around the ffmpeg / ffprobe binaries (must be on PATH). */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * What the container looked like when the host killed a child: cgroup memory use/limit, OOM kill
 * count, and the biggest processes. Linux only; elsewhere returns "".
 */
export function memorySnapshot(): string {
  const read = (f: string) => {
    try {
      return readFileSync(f, "utf8").trim();
    } catch {
      return "";
    }
  };
  const mb = (v: string) => (/^\d+$/.test(v) ? `${Math.round(Number(v) / 1048576)}MB` : v);
  const cur = read("/sys/fs/cgroup/memory.current");
  if (!cur) return "";
  const oom = /oom_kill (\d+)/.exec(read("/sys/fs/cgroup/memory.events"))?.[1] ?? "?";
  let top = "";
  try {
    top = execFileSync("ps", ["-eo", "rss=,comm=", "--sort=-rss"], { encoding: "utf8", timeout: 2000 })
      .split("\n").slice(0, 5).map((l) => l.trim().replace(/^(\d+)\s+/, (_, kb) => `${Math.round(Number(kb) / 1024)}MB `)).join(", ");
  } catch {
    /* ps missing */
  }
  return `memory ${mb(cur)} of ${mb(read("/sys/fs/cgroup/memory.max"))}, oom_kill ${oom}${top ? `, top: ${top}` : ""}`;
}

export function run(cmd: string, args: string[], timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      p.kill("SIGKILL");
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      // A SIGKILL we didn't send came from the host (usually memory): say so, with numbers.
      const why = timedOut ? `timed out after ${Math.round(timeoutMs / 1000)}s` : signal === "SIGKILL" ? `killed by the host (${memorySnapshot() || "no memory info"})` : "";
      if (why) console.error(`[ff] ${cmd} ${why}`);
      reject(new Error(`${cmd} exited ${code ?? signal}${why ? ` [${why}]` : ""}: ${err.slice(-1500)}`));
    });
  });
}

/** Containers report the host's cores; x264 sizes its threads (and frame buffers) from that. FFMPEG_THREADS caps it. */
const threadArgs = (args: string[]) => (process.env.FFMPEG_THREADS && !args.includes("-threads") ? ["-threads", process.env.FFMPEG_THREADS] : []);

export const ffmpeg = (args: string[], timeoutMs?: number) =>
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args.slice(0, -1), ...threadArgs(args), ...args.slice(-1)], timeoutMs);

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
