/**
 * HarnessRouter client (UHP 2026-10-19). See docs/hr-api.md.
 * POST {base}/v1/responses with metadata.harness_id, stream=true; continue with previous_response_id.
 */
import { FlowSchema } from "../../../harness/schemas/flow";
import type { PlanRequest, Planner, PlannerEvent } from "./types";

export type HarnessConfig = { baseUrl: string; apiKey: string; harnessId: string; model?: string; fetchImpl?: typeof fetch };

export const PLAN_INSTRUCTIONS = `You are Pit Crew, an agent that plans a short narrated demo video of a web product and drafts its build log.
Our server will execute your click-flow in Chromium at 1280x720, voice your narration, and edit the video.

Rules for flow.steps (5-10 steps, total 45-75 seconds):
- actions: goto {url} | click {selector} | type {selector, text} | scroll {y: pixels, positive = down} | wait.
- Story: hook (what it is, who it's for) -> core flow -> the "wow" moment -> close with the URL.
- Only use selectors you have verified exist on the live page (Playwright syntax, e.g. text=Get started, #id, a[href="/pricing"]). Prefer goto over click when unsure.
- Never log in, sign up, submit payments, or enter personal data. Use obviously fake demo inputs.
- Each "say" is at most 25 words, plain and specific, present tense. No hype words ("revolutionary", "game-changing"). Never claim a feature you did not see on the site or in the README.
- hold_ms is 2500-8000 and at least (words in say / 2.5) seconds + 0.8s.
- The first step must be a goto to the live URL.

If commits are provided, write build_log_md: dated sections (## Mon DD) from the commits, each with what was built / decided / struggled / next, max 600 words, only facts from the commits and README.

Reply with ONE fenced json block and nothing else:
\`\`\`json
{"summary": "3 sentences: who it's for, the problem, the wow moment",
 "flow": {"project_name": "...", "url": "...", "viewport": {"width": 1280, "height": 720},
          "steps": [{"id": "s1", "action": "goto", "url": "...", "hold_ms": 4000, "say": "..."}]},
 "build_log_md": "markdown or null"}
\`\`\``;

export function buildPlanPrompt(req: PlanRequest) {
  const d = req.digest;
  const digest = {
    final_url: d.finalUrl,
    home: { title: d.home.title, description: d.home.description, h1: d.home.h1, sections: d.home.sections.slice(0, 12), links: d.home.links.slice(0, 20), inputs: d.home.inputs, height: d.home.height },
    pages: d.pages.map((p) => ({ url: p.url, title: p.title, h1: p.h1, description: p.description, sections: p.sections.slice(0, 6) })),
  };
  const parts = [
    `Project name: ${req.projectName}`,
    `Live URL: ${req.liveUrl}`,
    req.blurb ? `What it does (from the team): ${req.blurb}` : "",
    `Site digest we collected (verified headings, links and inputs; y = pixel offset from top):\n${JSON.stringify(digest)}`,
    "You may also open the live URL in your browser to verify selectors (max 8 page loads).",
  ];
  if (req.commits?.length) {
    const commits = req.commits.slice(0, 200).map((c) => `${c.date.slice(0, 10)} ${c.sha} ${c.message.split("\n")[0].slice(0, 120)}`);
    parts.push(`Repo: ${req.repoUrl}\nCommits (newest first):\n${commits.join("\n")}`);
    if (req.readme) parts.push(`README (truncated):\n${req.readme.slice(0, 4000)}`);
  } else parts.push("No repo given: set build_log_md to null.");
  return parts.filter(Boolean).join("\n\n");
}

/** Extracts the last JSON object from a fenced block (or the whole text). */
export function extractJson(text: string): unknown {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fences.length ? fences.reverse() : [text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  throw new Error("agent reply had no parseable JSON block");
}

type UhpResponse = {
  id: string;
  status: string;
  error?: { message?: string; code?: string } | null;
  output?: { type: string; content?: { type: string; text?: string }[]; name?: string }[];
  metadata?: Record<string, unknown>;
};

const messageText = (r: UhpResponse) =>
  (r.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("\n");

/** Parses a text/event-stream body into JSON events. */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<Record<string, unknown>> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
      const data = raw
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data);
      } catch {
        /* ignore malformed event */
      }
    }
  }
}

export class HarnessRouterPlanner implements Planner {
  readonly name = "harnessrouter";
  constructor(private cfg: HarnessConfig) {}

  private async *call(body: Record<string, unknown>): AsyncIterable<PlannerEvent> {
    const f = this.cfg.fetchImpl ?? fetch;
    const res = await f(`${this.cfg.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        ...body,
        ...(this.cfg.model ? { model: this.cfg.model } : {}),
        metadata: { harness_id: this.cfg.harnessId, app: "pit-crew" },
        instructions: PLAN_INSTRUCTIONS,
        stream: true,
        timeout_seconds: 420,
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      let msg = `HarnessRouter HTTP ${res.status}`;
      try {
        msg += `: ${JSON.parse(t).error?.message ?? ""}`;
      } catch {
        msg += `: ${t.slice(0, 200)}`;
      }
      throw new Error(msg);
    }

    let final: UhpResponse | undefined;
    let text = "";
    for await (const ev of sseEvents(res.body)) {
      const type = String(ev.type ?? "");
      if (type === "response.created") yield { type: "log", message: `HarnessRouter session started (${(ev.response as UhpResponse)?.id ?? "?"})` };
      else if (type === "response.output_item.added") {
        const item = ev.item as { type?: string; name?: string };
        if (item?.type === "function_call") yield { type: "log", message: `agent tool: ${item.name ?? "?"}` };
      } else if (type === "response.output_item.done") {
        const item = ev.item as { type?: string; name?: string; arguments?: string };
        if (item?.type === "function_call" && item.arguments) {
          const a = item.arguments.slice(0, 140);
          yield { type: "log", message: `agent ${item.name}: ${a}` };
        }
      } else if (type === "response.output_text.delta") text += String(ev.delta ?? "");
      else if (type === "error") yield { type: "log", message: `harness error: ${String(ev.message ?? "")}` };
      else if (type === "response.completed" || type === "response.incomplete" || type === "response.failed")
        final = ev.response as UhpResponse;
    }
    if (!final) throw new Error("HarnessRouter stream ended without a terminal event");
    if (final.status !== "completed") throw new Error(`HarnessRouter task ${final.status}: ${final.error?.message ?? ""}`);

    const parsed = extractJson(messageText(final) || text) as { summary?: string; flow?: unknown; build_log_md?: string | null };
    const flow = FlowSchema.parse(parsed.flow);
    yield { type: "plan", flow, summary: parsed.summary, buildLog: parsed.build_log_md ?? undefined, sessionId: final.id, source: "harness" };
  }

  plan(req: PlanRequest) {
    return this.call({ input: buildPlanPrompt(req) });
  }

  revise(req: PlanRequest & { sessionId?: string; previous: unknown; request: string }) {
    const input =
      `Revision request from the user: "${req.request}"\n` +
      `Change only what's needed and reply with the full JSON block again (same format). Keep build_log_md unless asked.`;
    if (req.sessionId) return this.call({ input, previous_response_id: req.sessionId });
    return this.call({ input: `${buildPlanPrompt(req)}\n\nPrevious flow:\n${JSON.stringify(req.previous)}\n\n${input}` });
  }
}
