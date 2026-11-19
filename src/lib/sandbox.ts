/**
 * sandbox-run: the agent clones, installs, starts and records a GitHub-only web app INSIDE the
 * HarnessRouter sandbox (repo code never runs on our server). We then download the recording
 * (demo.webm, timings.json, shots/) from the session's files and polish it like a live recording.
 */
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ffmpeg } from "../../harness/scripts/ff";
import type { StepTiming } from "../../harness/scripts/record_flow";

export const SANDBOX_PORT = 4100;
export const SANDBOX_INSTALL_MIN = 6;

let recorderSrc = "";
function recorder() {
  if (!recorderSrc) recorderSrc = readFileSync(path.join(process.cwd(), "harness", "sandbox", "record.cjs"), "utf8");
  return recorderSrc;
}

/** The mode-specific part of the plan request for sandbox-run. */
export function sandboxPrompt(repoUrl: string) {
  return [
    `Demo mode: sandbox-run (there is no live link). In your sandbox, run the project and record it:`,
    `1. git clone --depth 1 ${repoUrl} app, then detect the stack (package.json, requirements.txt, pyproject.toml, Cargo.toml, Dockerfile, Makefile) and read the README's run instructions.`,
    `2. Install with a ${SANDBOX_INSTALL_MIN}-minute limit. Never use real secrets: if .env.example exists, copy it to the env file the README names with secret values left empty, or use documented demo/example values only.`,
    `3. Start it in the background on port ${SANDBOX_PORT} if you can choose the port (e.g. npm run dev -- --port ${SANDBOX_PORT}), otherwise find the port it listens on. Wait until it answers HTTP 200 (max 2 minutes).`,
    `4. Explore the running app in your browser like a live site, then plan the video. flow.url and every goto use http://localhost:<port>; use only selectors you verified there. Skip sign-in pages; demo what works without an account.`,
    `5. Save your flow as flow.json, write the recorder below to record.cjs, and run: NODE_PATH=$(npm root -g) node record.cjs flow.json  (it writes demo.webm, timings.json and shots/ in your working directory; leave them there, at the top level).`,
    `If install or start fails within the limits, do not keep trying: set "demo_mode": "repo-showcase" at the top level of your JSON and plan a repository showcase instead (rules for repo-showcase apply). Otherwise set "demo_mode": "sandbox-run".`,
    "Recorder (record.cjs):\n```js\n" + recorder() + "\n```",
  ].join("\n");
}

type SessionFile = { path?: string; filename?: string; download_url?: string; bytes?: number };

/** Downloads the sandbox recording into outDir as recording.mp4 + timings.json + shots/. */
export async function fetchSandboxRecording(
  sessionId: string,
  outDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ timings: StepTiming[]; videoPath: string; stepsOk: number }> {
  const base = (process.env.HARNESSROUTER_BASE_URL || "https://api.harnessrouter.ai").replace(/\/+$/, "").replace(/\/v1$/, "");
  const key = process.env.HR_API_KEY || process.env.HARNESSROUTER_API_KEY;
  if (!key) throw new Error("no HarnessRouter key on the server");
  const headers = { Authorization: `Bearer ${key}`, "UHP-Version": "2026-09-28" };
  const res = await fetchImpl(`${base}/v1/sessions/${encodeURIComponent(sessionId)}/files`, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`sandbox files: HTTP ${res.status}`);
  const body = (await res.json()) as { files?: SessionFile[]; data?: SessionFile[] };
  const files = body.files ?? body.data ?? [];
  const want = (p: string) => p === "demo.webm" || p === "timings.json" || /^shots\/[A-Za-z0-9_-]+\.png$/.test(p);
  const get = async (f: SessionFile) => {
    if (!f.download_url?.startsWith(base)) throw new Error("unexpected download URL");
    const r = await fetchImpl(f.download_url, { headers, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`download ${f.path}: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const picked = files.filter((f) => want(f.path ?? ""));
  const video = picked.find((f) => f.path === "demo.webm");
  const timingsFile = picked.find((f) => f.path === "timings.json");
  if (!video || !timingsFile) throw new Error("the sandbox left no recording (demo.webm + timings.json)");
  if ((video.bytes ?? 0) > 400 * 1024 * 1024) throw new Error("sandbox recording too large");
  await fs.mkdir(path.join(outDir, "shots"), { recursive: true });
  const webm = path.join(outDir, "sandbox.webm");
  await fs.writeFile(webm, await get(video));
  const raw = JSON.parse((await get(timingsFile)).toString("utf8")) as StepTiming[];
  const timings = raw
    .filter((t) => typeof t.step_id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(t.step_id))
    .map((t) => ({ step_id: t.step_id, ok: !!t.ok, start_ms: Number(t.start_ms) || 0, end_ms: Number(t.end_ms) || 0, ...(t.error ? { error: String(t.error).slice(0, 200) } : {}), ...(t.box ? { box: t.box } : {}) }));
  for (const f of picked.filter((x) => x.path?.startsWith("shots/"))) await fs.writeFile(path.join(outDir, f.path!), await get(f));
  const videoPath = path.join(outDir, "recording.mp4");
  await ffmpeg(["-i", webm, "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-an", videoPath]);
  await fs.rm(webm, { force: true });
  await fs.writeFile(path.join(outDir, "timings.json"), JSON.stringify(timings, null, 2));
  return { timings, videoPath, stepsOk: timings.filter((t) => t.ok).length };
}
