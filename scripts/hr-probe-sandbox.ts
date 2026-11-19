/**
 * Phase 0 for GitHub-only projects: can the HarnessRouter sandbox clone a repo, install it, start it,
 * record it with Playwright, and hand the recording back to us? Prints the agent's report, then lists
 * and downloads the session's files into the given folder.
 *   npx tsx --env-file=.env scripts/hr-probe-sandbox.ts <repo_url> <out_dir>
 */
import fs from "node:fs";
import path from "node:path";
import { sseEvents } from "../src/lib/harness/real";

const repo = process.argv[2] ?? "https://github.com/Mallard64/stemduolingo";
const outDir = path.resolve(process.argv[3] ?? "tmp/probe");

const PROMPT = `Pre-flight check for a Pit Crew pitch video of a GitHub-only project (no live link): we need to know whether you can run the project in your sandbox and record its UI. Do not plan a video yet. Use your shell. Run each step, time it, and report the raw result in one bullet each:
1) Limits: nproc; free -m; df -h . ; ulimit -a | head -5; node -v; npm -v; python3 -V; git --version; which xvfb-run Xvfb ffmpeg.
2) git clone --depth 1 ${repo} app && ls app (report seconds taken).
3) cd app && detect the stack from package.json / requirements.txt / pyproject.toml / Cargo.toml / Dockerfile / Makefile. Read the README run instructions. Never add secrets; if an .env.example exists, copy it to the env file the README names and leave secret values empty.
4) Install (npm ci or npm install, or pip install -r requirements.txt) with a 6 minute limit; report seconds and the last 5 lines of output.
5) Start the dev server in the background (e.g. npm run dev -- --port 4100 > server.log 2>&1 &), wait until curl -s -o /dev/null -w "%{http_code}" http://localhost:4100 returns 200 (max 120 s), report the code and seconds.
6) With Playwright (Node, chromium headless, viewport 1280x720, recordVideo dir ./rec size 1280x720), open http://localhost:4100, wait 3 s, click the first visible link or button that navigates inside the app, wait 3 s, scroll down 600 px, wait 2 s, close the context so the video is saved. Move the video to ./demo.webm and report its size.
7) Also save a full-page screenshot as ./home.png.
Leave demo.webm and home.png as files in your working directory. Reply only with the 7 bullets.`;

async function main() {
  const base = (process.env.HARNESSROUTER_BASE_URL || "https://api.harnessrouter.ai").replace(/\/+$/, "").replace(/\/v1$/, "");
  const key = process.env.HR_API_KEY || process.env.HARNESSROUTER_API_KEY;
  const id = process.env.HARNESS_ID;
  if (!key || !id) throw new Error("Set HR_API_KEY and HARNESS_ID in .env");
  const headers = { Authorization: `Bearer ${key}`, "UHP-Version": "2026-09-28" };
  fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  const res = await fetch(`${base}/v1/responses`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ input: PROMPT, metadata: { harness_id: id }, stream: true, timeout_seconds: 1200 }),
  });
  console.log(`HTTP ${res.status}`);
  if (!res.ok || !res.body) return console.log(await res.text());
  let sessionId = "";
  let text = "";
  for await (const ev of sseEvents(res.body)) {
    const type = String(ev.type);
    if (type === "response.output_text.delta") text += String(ev.delta);
    else if (type === "response.output_item.added" && (ev.item as { type: string }).type === "function_call")
      console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s tool: ${(ev.item as { name?: string }).name}`);
    else if (/^response\.(completed|failed|incomplete)/.test(type)) {
      const r = ev.response as { id: string; status: string; usage: unknown; metadata?: { session_id?: string }; error: unknown };
      sessionId = r.metadata?.session_id ?? "";
      console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s ${type}`, JSON.stringify({ id: r.id, status: r.status, usage: r.usage, session_id: sessionId, error: r.error }));
    }
  }
  console.log("\n--- report ---\n" + text);
  fs.writeFileSync(path.join(outDir, "report.md"), text);
  if (!sessionId) return;
  const list = await fetch(`${base}/v1/sessions/${sessionId}/files`, { headers });
  const body = (await list.json().catch(() => ({}))) as { files?: { id?: string; file_id?: string; container_id?: string; filename?: string; path?: string; bytes?: number; download_url?: string }[]; data?: { id?: string; file_id?: string; container_id?: string; filename?: string; path?: string; bytes?: number; download_url?: string }[] };
  console.log(`files HTTP ${list.status}:`, JSON.stringify(body).slice(0, 800));
  for (const f of body.files ?? body.data ?? []) {
    const name = path.basename(f.filename ?? f.path ?? "");
    // Only our outputs at the top of the workspace, not the cloned repo's own files.
    if (!/\.(webm|mp4|png)$/.test(name) || (f.path ?? name).includes("/")) continue;
    const url = f.download_url ?? `${base}/v1/containers/${f.container_id}/files/${f.file_id ?? f.id}/content`;
    const dl = await fetch(url.startsWith("http") ? url : `${base}${url}`, { headers });
    if (!dl.ok) {
      console.log(`download ${name}: HTTP ${dl.status}`);
      continue;
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    fs.writeFileSync(path.join(outDir, name), buf);
    console.log(`downloaded ${name} (${buf.length} bytes)`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
