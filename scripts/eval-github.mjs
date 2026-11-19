// Production eval for GitHub-only projects + one live-URL regression. Usage:
//   node scripts/eval-github.mjs wait            -> waits for the new build
//   node scripts/eval-github.mjs run             -> submits the jobs, polls, downloads outputs to eval/github-only/<slug>/
import fs from "node:fs";
import path from "node:path";
const BASE = process.env.PITCREW_URL || "https://pitcrew-production-83e5860b.up.railway.app";
const OUT = path.resolve("eval/github-only");
const log = (m) => { console.log(m); fs.appendFileSync(path.join(OUT, "run.log"), `${new Date().toISOString()} ${m}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILES = ["demo.mp4", "thumb.jpg", "captions.srt", "script.md", "video_plan.json", "pitch_check.md", "pitch_check.json", "sources.md", "submission.md", "build_log.md", "flow.json"];

const JOBS = [
  { slug: "wumpus", project_name: "Hunt the Wumpus", repo_url: "https://github.com/Mallard64/Wumpus", footage: "/Users/bigdum/Desktop/hunt-the-wumpus-gameplay.mp4" },
  { slug: "omnistem", project_name: "OmniSTEM", repo_url: "https://github.com/Mallard64/stemduolingo" },
  { slug: "devpad", project_name: "DevPad", repo_url: "https://github.com/yuchan-chung1964/DevPad" },
  { slug: "regression-excalidraw", project_name: "Excalidraw", live_url: "https://excalidraw.com", repo_url: "https://github.com/excalidraw/excalidraw" },
];

async function waitLive() {
  for (let i = 0; i < 80; i++) {
    const html = await fetch(BASE + "/").then((r) => r.text()).catch(() => "");
    if (html.includes("how it&#x27;s built") || html.includes("how it's built")) return log(`new build live after ${i * 15}s`);
    await sleep(15000);
  }
  log("new build not live after 20 min");
  process.exit(1);
}

async function upload(file) {
  const buf = fs.readFileSync(file);
  const r = await fetch(BASE + "/api/uploads", { method: "POST", headers: { "content-type": "video/mp4" }, body: buf });
  const b = await r.json();
  log(`upload ${path.basename(file)}: ${r.status} ${JSON.stringify(b)}`);
  if (r.status !== 201) throw new Error("upload failed");
  return b.id;
}

async function run() {
  const jobs = [];
  for (const j of JOBS) {
    const body = { project_name: j.project_name, repo_url: j.repo_url, live_url: j.live_url ?? "", length_s: 60 };
    if (j.footage) body.footage = await upload(j.footage);
    const r = await fetch(BASE + "/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json();
    log(`create ${j.slug}: ${r.status} ${JSON.stringify(b)}`);
    if (r.status === 201) jobs.push({ ...j, id: b.id, t0: Date.now() });
  }
  const results = [];
  const done = new Set();
  while (done.size < jobs.length) {
    await sleep(20000);
    for (const j of jobs) {
      if (done.has(j.id)) continue;
      const r = await fetch(`${BASE}/api/jobs/${j.id}`).then((x) => x.json()).catch(() => null);
      if (!r) continue;
      const s = r.job.status;
      if (s !== j.last) { log(`${j.slug} ${j.id}: ${s}${r.job.demo_mode ? ` (${r.job.demo_mode})` : ""}`); j.last = s; }
      if (!["ok", "partial", "failed"].includes(s)) continue;
      done.add(j.id);
      const dir = path.join(OUT, j.slug);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of FILES) {
        const res = await fetch(`${BASE}/api/jobs/${j.id}/files/${f}`);
        if (res.ok) fs.writeFileSync(path.join(dir, f), Buffer.from(await res.arrayBuffer()));
      }
      const ev = await fetch(`${BASE}/api/jobs/${j.id}/events`, { signal: AbortSignal.timeout(10000) }).then((x) => x.text()).catch(() => "");
      fs.writeFileSync(path.join(dir, "log.txt"), ev.split("\n").filter((l) => l.startsWith("data: ")).map((l) => { try { return JSON.parse(l.slice(6)).message; } catch { return ""; } }).join("\n"));
      const c = r.job.contract_json ? JSON.parse(r.job.contract_json) : {};
      let pc = null;
      try { pc = JSON.parse(fs.readFileSync(path.join(dir, "pitch_check.json"), "utf8")); } catch {}
      const res = { slug: j.slug, id: j.id, url: `${BASE}/jobs/${j.id}`, status: s, demo_mode: r.job.demo_mode, notice: r.job.notice, duration_s: c.duration_s, steps: `${c.steps_ok}/${c.steps_total}`, kit: r.job.style_kit, pitch: pc ? `${pc.score}/${pc.total}` : null, notes: c.notes, error: r.job.error, wall_s: Math.round((Date.now() - j.t0) / 1000) };
      results.push(res);
      fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
      log(`RESULT ${JSON.stringify(res)}`);
    }
  }
  log("ALL DONE");
}

if (process.argv[2] === "wait") await waitLive();
else await run();
