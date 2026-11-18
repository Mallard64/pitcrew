/**
 * Reads the live Harness (HARNESS_ID) and writes harnessrouter.json (harness_id, name, base, model, instructions).
 *   npx tsx --env-file=.env scripts/hr-harness.ts            -> fetch + write harnessrouter.json
 *   npx tsx --env-file=.env scripts/hr-harness.ts --models   -> also list models available on its base
 *   npx tsx --env-file=.env scripts/hr-harness.ts --apply [--model <id>] [--instructions <file>]
 *       -> fetch (keep ETag) -> full PUT with If-Match (PUT replaces, so every live field is resent)
 *          -> re-read and compare -> rewrite harnessrouter.json. A 412 means it changed meanwhile: rerun.
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

// live (camelCase) -> request (snake_case); a PUT must carry every field or it gets reset.
const FIELDS: [string, string][] = [
  ["name", "name"], ["base", "base"], ["defaultModel", "default_model"], ["systemPrompt", "system_prompt"],
  ["mcpServers", "mcp_servers"], ["skills", "skills"], ["plugins", "plugins"], ["additionalHeaders", "additional_headers"],
  ["env", "env"], ["maxStep", "max_step"], ["timeoutSeconds", "timeout_seconds"], ["maxCostUsd", "max_cost_usd"],
  ["reasoningEffort", "reasoning_effort"], ["environment", "environment"], ["disabledTools", "disabled_tools"],
];
const arg = (f: string) => {
  const i = process.argv.indexOf(f);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function apply() {
  const model = arg("--model");
  const instrFile = arg("--instructions");
  const { body: live, etag } = await get(`/v1/harnesses/${id}`);
  const body: Record<string, unknown> = {};
  for (const [camel, snake] of FIELDS) if (camel in live) body[snake] = live[camel];
  if (live.engineMember) body.engine_member = live.engineMember;
  if (model) {
    const { body: b } = await get("/v1/bases");
    const baseInfo = (b.bases ?? []).find((x: { id: string }) => x.id === live.base);
    const ok = (baseInfo?.models ?? []).some((m: { id: string; available?: boolean }) => m.id === model && m.available);
    if (!ok) throw new Error(`model ${model} is not available on base ${live.base}`);
    body.default_model = model;
  }
  if (instrFile) body.system_prompt = fs.readFileSync(instrFile, "utf8").trim();
  const res = await fetch(`${base}/v1/harnesses/${id}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json", ...(etag ? { "If-Match": etag } : {}) },
    body: JSON.stringify(body),
  });
  if (res.status === 412) throw new Error("412: the harness changed meanwhile. Rerun to fetch it again and redo the change.");
  if (!res.ok) throw new Error(`PUT → ${res.status} ${(await res.text()).slice(0, 300)}`);
  const { body: after } = await get(`/v1/harnesses/${id}`);
  const mismatched = FIELDS.filter(([camel, snake]) => snake in body && JSON.stringify(after[camel]) !== JSON.stringify(body[snake])).map(([, s]) => s);
  const entry = { harness_id: after.id, name: after.name, base: after.base, model: after.defaultModel ?? "", instructions: after.systemPrompt ?? "" };
  fs.writeFileSync("harnessrouter.json", JSON.stringify(entry, null, 2) + "\n");
  console.log(JSON.stringify({ status: mismatched.length ? "READBACK_MISMATCH" : "UPDATED", harness_id: after.id, base: after.base,
    model: after.defaultModel, instructions_chars: (after.systemPrompt ?? "").length, mismatched }, null, 2));
}

async function main() {
  if (process.argv.includes("--apply")) {
    if (!key || !id) throw new Error("Set HR_API_KEY (or HARNESSROUTER_API_KEY) and HARNESS_ID");
    return apply();
  }
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
