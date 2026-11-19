/**
 * Repro for build log #1: the same JPEG sent as `input_image` vs `input_file`.
 *   npx tsx --env-file=.env scripts/hr-image-input-check.ts <image.jpg>
 * Prints HTTP status, time and the agent's reply for each (no keys or ids printed).
 */
import fs from "node:fs";

const img = fs.readFileSync(process.argv[2] ?? "launch/build-log/img/wumpus-keyframe-sent.jpg").toString("base64");
const base = (process.env.HARNESSROUTER_BASE_URL || "https://api.harnessrouter.ai").replace(/\/+$/, "").replace(/\/v1$/, "");
const key = process.env.HR_API_KEY || process.env.HARNESSROUTER_API_KEY;
const prompt = "Pre-flight check for a Pit Crew pitch video of team footage: describe the attached game screenshot in one sentence. Reply with only that sentence.";

async function run(label: string, part: Record<string, unknown>) {
  const t0 = Date.now();
  const res = await fetch(`${base}/v1/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "UHP-Version": "2026-09-28" },
    body: JSON.stringify({ metadata: { harness_id: process.env.HARNESS_ID }, timeout_seconds: 180, input: [{ type: "message", role: "user", content: [{ type: "input_text", text: prompt }, part] }] }),
  });
  const j = (await res.json()) as { status?: string; output?: { type: string; content?: { text?: string }[] }[]; metadata?: Record<string, unknown> };
  const text = (j.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text).join(" ");
  console.log(`$ ${label}`);
  console.log(`HTTP ${res.status} · status: ${j.status} · ${Math.round((Date.now() - t0) / 1000)} s · ignored_fields: ${JSON.stringify(j.metadata?.ignored_fields ?? [])}`);
  console.log(`agent: ${text}\n`);
}

(async () => {
  await run('content part {type:"input_image", image_url:"data:image/jpeg;base64,…"}', { type: "input_image", image_url: `data:image/jpeg;base64,${img}` });
  await run('content part {type:"input_file", filename:"f1.jpg", file_data:"data:image/jpeg;base64,…"}', { type: "input_file", filename: "f1.jpg", file_data: `data:image/jpeg;base64,${img}` });
})();
