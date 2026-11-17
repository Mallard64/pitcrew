/**
 * Phase 0: talk to HarnessRouter once and print the streamed events.
 *   npx tsx --env-file=.env scripts/hr-smoke.ts            -> hello world
 *   npx tsx --env-file=.env scripts/hr-smoke.ts --probe    -> sandbox capability probe (record results in DECISIONS.md)
 */
import { sseEvents } from "../src/lib/harness/real";

const PROBE = `Run these shell commands in your sandbox and report each output verbatim, then answer the questions:
1) curl -sI https://example.com | head -1
2) which ffmpeg && ffmpeg -version | head -1
3) npx --yes playwright --version
4) node -e "require('playwright').chromium.launch().then(b=>{console.log('chromium ok');return b.close()}).catch(e=>console.log('chromium fail',e.message))"
5) head -c 5000000 /dev/urandom > probe.bin && ls -la probe.bin   (keep probe.bin as an artifact)
Questions: what is your max task runtime? Can you install apt packages? Reply as a short bullet list.`;

async function main() {
  const { HARNESSROUTER_BASE_URL: base, HARNESSROUTER_API_KEY: key, HARNESS_ID: id, HARNESS_MODEL: model } = process.env;
  if (!base || !key || !id) throw new Error("Set HARNESSROUTER_BASE_URL, HARNESSROUTER_API_KEY and HARNESS_ID in .env");
  const probe = process.argv.includes("--probe");
  const t0 = Date.now();
  const res = await fetch(`${base.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: probe ? PROBE : "Reply with exactly: pit crew online",
      ...(model ? { model } : {}),
      metadata: { harness_id: id, app: "pit-crew-smoke" },
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
