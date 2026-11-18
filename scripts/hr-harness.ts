/**
 * Reads the live Harness (HARNESS_ID) and writes harnessrouter.json (harness_id, name, base, model, instructions).
 *   npx tsx --env-file=.env scripts/hr-harness.ts            -> fetch + write harnessrouter.json
 *   npx tsx --env-file=.env scripts/hr-harness.ts --models   -> also list models available on its base
 */
import fs from "node:fs";

const base = (process.env.HARNESSROUTER_BASE_URL || "https://api.harnessrouter.ai").replace(/\/+$/, "").replace(/\/v1$/, "");
const key = process.env.HR_API_KEY || process.env.HARNESSROUTER_API_KEY;
const id = process.env.HARNESS_ID;
const headers = { Authorization: `Bearer ${key}`, "UHP-Version": "2026-09-28", Accept: "application/json" };

async function get(path: string) {
  const res = await fetch(`${base}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return { body, etag: res.headers.get("etag") };
}

async function main() {
  if (!key || !id) throw new Error("Set HR_API_KEY (or HARNESSROUTER_API_KEY) and HARNESS_ID");
  const { body: h, etag } = await get(`/v1/harnesses/${id}`);
  const entry = { harness_id: h.id, name: h.name, base: h.base, model: h.defaultModel ?? "", instructions: h.systemPrompt ?? "" };
  fs.writeFileSync("harnessrouter.json", JSON.stringify(entry, null, 2) + "\n");
  console.log(JSON.stringify({ harness_id: h.id, name: h.name, base: h.base, model: h.defaultModel, instructions_chars: (h.systemPrompt ?? "").length, etag }, null, 2));
  try {
    const { body: me } = await get("/v1/me");
    console.log("workspace:", me.workspace_name ?? me.workspace?.name ?? "(not reported)");
  } catch (e) {
    console.log("workspace: (GET /v1/me failed)", (e as Error).message.slice(0, 120));
  }
  if (process.argv.includes("--models")) {
    const { body: b } = await get("/v1/bases");
    const mine = (b.bases ?? []).find((x: { id: string }) => x.id === h.base);
    const avail = (mine?.models ?? []).filter((m: { available?: boolean }) => m.available).map((m: { id: string }) => m.id);
    console.log(`models available on ${h.base} (default ${mine?.defaultModel}):`, avail.join(", "));
  }
}
main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
