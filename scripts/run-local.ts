/**
 * Runs one job end to end without the web app.
 *   tsx scripts/run-local.ts <url|""> "<name>" [repo_url] [out_dir] [--footage <file>] [--length <s>] [--pitch-room]
 * --pitch-room runs the Pitch Room, writes pitch_room.json and approves the judge's pick.
 * An empty url with a repo runs a GitHub-only job (sandbox-run or repo-showcase).
 */
import fs from "node:fs";
import path from "node:path";
import { runPipeline } from "../src/lib/pipeline";
import { getPlanner } from "../src/lib/harness";

function flag(name: string) {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  process.argv.splice(i, 2);
  return v;
}

async function main() {
  const footage = flag("--footage");
  const length = flag("--length");
  const pitchRoom = process.argv.includes("--pitch-room");
  if (pitchRoom) process.argv.splice(process.argv.indexOf("--pitch-room"), 1);
  const [url, name, repoUrl, out] = process.argv.slice(2);
  if (url === undefined || !name) throw new Error('usage: tsx scripts/run-local.ts <url|""> "<name>" [repo_url] [out_dir] [--footage file] [--length s]');
  const dir = path.resolve(out ?? `tmp/run-${Date.now()}`);
  const t0 = Date.now();
  const res = await runPipeline(
    { projectName: name, liveUrl: url, repoUrl: repoUrl || undefined, footagePath: footage ? path.resolve(footage) : undefined, lengthS: length ? Number(length) : undefined, pitchRoom },
    dir,
    1,
    (e) => console.error(e.type === "progress" ? `[${e.step}] ${e.message}` : `   ${e.message}`),
    getPlanner(),
    undefined,
    {
      onMeta: (m) => console.error(`   [meta] ${JSON.stringify(m)}`),
      extendBudget: () => {},
      onPitchRoom: (r) => fs.writeFileSync(path.join(dir, "pitch_room.json"), JSON.stringify(r, null, 2)),
      // Only Pitch Room pauses here: approve the judge's pick as written.
      awaitReview: async () => null,
    },
  );
  console.log(JSON.stringify({ dir, seconds: Math.round((Date.now() - t0) / 1000), demo_mode: res.demoMode, notice: res.notice, ...res.contract, files: res.files }, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
