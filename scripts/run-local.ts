/** Runs one job end to end without the web app. Usage: tsx scripts/run-local.ts <url> "<name>" [repo_url] [out_dir] */
import path from "node:path";
import { runPipeline } from "../src/lib/pipeline";
import { getPlanner } from "../src/lib/harness";

async function main() {
  const [url, name, repoUrl, out] = process.argv.slice(2);
  if (!url || !name) throw new Error('usage: tsx scripts/run-local.ts <url> "<name>" [repo_url] [out_dir]');
  const dir = path.resolve(out ?? `tmp/run-${Date.now()}`);
  const t0 = Date.now();
  const res = await runPipeline({ projectName: name, liveUrl: url, repoUrl: repoUrl || undefined }, dir, 1, (e) =>
    console.error(e.type === "progress" ? `[${e.step}] ${e.message}` : `   ${e.message}`), getPlanner());
  console.log(JSON.stringify({ dir, seconds: Math.round((Date.now() - t0) / 1000), ...res.contract, files: res.files }, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
