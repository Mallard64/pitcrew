/**
 * Repro for build log #3: what the hosted sandbox actually has (vs docs/environments.md, which says the image
 * provides ffmpeg). One short task; prints HTTP status, time and the raw command output (no keys or ids printed).
 *   npx tsx --env-file=.env scripts/hr-sandbox-limits-check.ts
 */
const base = (process.env.HARNESSROUTER_BASE_URL || "https://api.harnessrouter.ai").replace(/\/+$/, "").replace(/\/v1$/, "");
const key = process.env.HR_API_KEY || process.env.HARNESSROUTER_API_KEY;
const CMD =
  "nproc; free -m | head -2; df -h . | tail -1; id -u; node -v; python3 -V; which ffmpeg || echo 'ffmpeg: not on PATH'; ls -d /ms-playwright/ffmpeg* 2>/dev/null; which xvfb-run Xvfb";
const prompt = `Pre-flight check for a Pit Crew pitch video. Use your terminal once to run exactly this command and reply with only its raw output in a code block, nothing else:\n${CMD}`;

(async () => {
  const t0 = Date.now();
  const res = await fetch(`${base}/v1/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "UHP-Version": "2026-09-28" },
    body: JSON.stringify({ metadata: { harness_id: process.env.HARNESS_ID }, timeout_seconds: 180, input: prompt }),
  });
  const j = (await res.json()) as { status?: string; output?: { type: string; content?: { text?: string }[] }[]; usage?: Record<string, number> };
  const text = (j.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text).join("\n");
  console.log(`$ ${CMD.replace(/; /g, ";\n  ")}`);
  console.log(`\nHTTP ${res.status} · status: ${j.status} · ${Math.round((Date.now() - t0) / 1000)} s · ${new Date().toISOString().slice(0, 10)}\n`);
  console.log(text);
})();
