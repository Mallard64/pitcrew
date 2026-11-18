/**
 * Phase 0: talk to HarnessRouter once and print the streamed events.
 *   npx tsx --env-file=.env scripts/hr-smoke.ts            -> hello world
 *   npx tsx --env-file=.env scripts/hr-smoke.ts --probe    -> sandbox capability probe (record results in DECISIONS.md)
 */
import { sseEvents } from "../src/lib/harness/real";

const PROBE = `Pre-flight check before planning a demo video (part of your Pit Crew job): we need to know which demo-pipeline steps can run in your environment. Do not plan a video yet. Run each check and report the raw result in one bullet each:
1) Fetch https://example.com and report the HTTP status and page title (can you reach the public web?).
2) Run a web search for "US Census Bureau small business statistics 2024" and list the first 2 result URLs (can you search?).
3) Fetch https://www.census.gov and report whether the page text loaded (can you fetch a source page for statistics?).
4) Shell: which ffmpeg && ffmpeg -version | head -1
5) Shell: npx --yes playwright --version, then try launching Chromium headless and report ok/fail.
6) Shell: head -c 5000000 /dev/urandom > probe.bin && ls -la probe.bin (keep probe.bin in your working directory as a file).
7) Your max task runtime and whether you can install apt packages, if you know.
If a check is impossible, say "not available" and why. Reply only with the 7 bullets.`;

async function main() {
  const base = process.env.HARNESSROUTER_BASE_URL || "https://api.harnessrouter.ai";
  const key = process.env.HR_API_KEY || process.env.HARNESSROUTER_API_KEY;
  const { HARNESS_ID: id, HARNESS_MODEL: model } = process.env;
  if (!key || !id) throw new Error("Set HR_API_KEY and HARNESS_ID in .env");
  const probe = process.argv.includes("--probe");
  const t0 = Date.now();
  const res = await fetch(`${base.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "UHP-Version": "2026-09-28" },
    body: JSON.stringify({
      input: probe ? PROBE : "Reply with exactly: pit crew online",
      ...(model ? { model } : {}),
      metadata: { harness_id: id },
      stream: true,
    }),
  });
  console.log(`HTTP ${res.status} ${res.headers.get("content-type")}`);
  if (!res.ok || !res.body) return console.log(await res.text());
  for await (const ev of sseEvents(res.body)) {
    const t = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
    const type = String(ev.type);
    if (type === "response.output_text.delta") process.stdout.write(String(ev.delta));
    else if (type.startsWith("response.completed") || type.startsWith("response.failed") || type.startsWith("response.incomplete")) {
      const r = ev.response as { id: string; status: string; model: string; usage: unknown; metadata: unknown; output: unknown[]; error: unknown };
      console.log(`\n${t}s ${type}`, JSON.stringify({ id: r.id, status: r.status, model: r.model, usage: r.usage, metadata: r.metadata, error: r.error }, null, 2));
      console.log("output item types:", r.output.map((o) => (o as { type: string }).type).join(", "));
    } else console.log(`${t}s ${type}${ev.item ? ` item=${(ev.item as { type: string }).type}` : ""}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
