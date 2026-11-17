/**
 * Phase 3 eval: runs the pipeline on each URL in eval/sites.txt and scores the output against
 * SPEC "Output acceptance criteria" with automated checks. Writes eval/results.md (+ results.json).
 * Narration accuracy and "≥3 distinct screens" still need a human look; the table says so.
 *   npx tsx --env-file-if-exists=.env scripts/eval.ts [eval/sites.txt]
 * sites.txt format: one per line: <url> | <project name> | <optional repo url>
 */
import fs from "node:fs";
import path from "node:path";
import { runPipeline } from "../src/lib/pipeline";
import { getPlanner } from "../src/lib/harness";
import { probeDuration, probeStreams } from "../harness/scripts/ff";

type Row = { name: string; url: string; status: string; duration_s: number; steps: string; seconds: number; checks: Record<string, boolean>; good: boolean; notes: string };

async function main() {
  const list = process.argv[2] ?? "eval/sites.txt";
  const sites = fs.readFileSync(list, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("|").map((x) => x.trim()));
  const outRoot = path.resolve("eval/runs", new Date().toISOString().replace(/[:.]/g, "-"));
  const rows: Row[] = [];
  for (const [url, name, repo] of sites) {
    const t0 = Date.now();
    const dir = path.join(outRoot, name.replace(/[^\w-]+/g, "_"));
    process.stderr.write(`\n=== ${name} (${url})\n`);
    try {
      const res = await runPipeline({ projectName: name, liveUrl: url, repoUrl: repo || undefined }, dir, 1, (e) => e.type === "progress" && process.stderr.write(`  [${e.step}] ${e.message}\n`), getPlanner());
      const demo = path.join(dir, "v1", "demo.mp4");
      const streams = await probeStreams(demo);
      const v = streams.find((s) => s.codec_type === "video");
      const a = streams.find((s) => s.codec_type === "audio");
      const dur = await probeDuration(demo);
      const checks = {
        "45-90s": dur >= 45 && dur <= 90,
        "1280x720 h264": v?.codec_name === "h264" && v.width === 1280 && v.height === 720,
        aac: a?.codec_name === "aac",
        "≥3 steps": res.contract.steps_ok >= 3,
        captions: fs.existsSync(path.join(dir, "v1", "captions.srt")) && fs.statSync(path.join(dir, "v1", "captions.srt")).size > 20,
        "≤6 min": Date.now() - t0 <= 6 * 60_000,
      };
      rows.push({ name, url, status: res.contract.status, duration_s: Math.round(dur * 10) / 10, steps: `${res.contract.steps_ok}/${res.contract.steps_total}`, seconds: Math.round((Date.now() - t0) / 1000), checks, good: Object.values(checks).every(Boolean), notes: res.contract.notes });
    } catch (e) {
      rows.push({ name, url, status: "failed", duration_s: 0, steps: "0", seconds: Math.round((Date.now() - t0) / 1000), checks: {}, good: false, notes: (e as Error).message.slice(0, 160) });
    }
  }
  const good = rows.filter((r) => r.good).length;
  const md = [
    `# Eval results`,
    ``,
    `Run: ${new Date().toISOString()} · planner: ${process.env.HARNESS_MODE === "real" ? "HarnessRouter" : "offline (mock)"} · TTS: ${process.env.TTS_PROVIDER || "none"}`,
    ``,
    `**Automated "good": ${good}/${rows.length} (${rows.length ? Math.round((good / rows.length) * 100) : 0}%).** Narration accuracy and "≥3 distinct screens" are not auto-checked; review the videos in \`${path.relative(process.cwd(), outRoot)}\`.`,
    ``,
    `| Project | Status | Duration | Steps | Wall time | Failed checks | Notes |`,
    `|---|---|---|---|---|---|---|`,
    ...rows.map((r) => `| [${r.name}](${r.url}) | ${r.status} | ${r.duration_s}s | ${r.steps} | ${r.seconds}s | ${Object.entries(r.checks).filter(([, ok]) => !ok).map(([k]) => k).join(", ") || (r.good ? "none" : "n/a")} | ${r.notes.replace(/\|/g, "/").slice(0, 120)} |`),
    ``,
  ].join("\n");
  fs.mkdirSync("eval", { recursive: true });
  fs.writeFileSync("eval/results.md", md);
  fs.writeFileSync(path.join(outRoot, "results.json"), JSON.stringify(rows, null, 2));
  console.log(md);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
