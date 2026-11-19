import crypto from "node:crypto";
import { readFileSync } from "node:fs";
/**
 * HarnessRouter client (UHP 2026-10-19). See docs/hr-api.md.
 * POST {base}/v1/responses with metadata.harness_id, stream=true; continue with previous_response_id.
 */
import { FlowSchema } from "../../../harness/schemas/flow";
import { DemoModeSchema, VideoPlanSchema, type DemoMode } from "../../../harness/schemas/video_plan";
import type { PlanRequest, Planner, PlannerEvent } from "./types";
import { formatSeconds, lengthBudget, lengthWindow } from "../pacing";
import { repoDigest } from "../repo";
import { sandboxPrompt } from "../sandbox";
import { topicRules } from "../sensitive";

export type HarnessConfig = { baseUrl?: string; apiKey: string; harnessId: string; model?: string; fetchImpl?: typeof fetch };

/** Standing instructions live in the HarnessRouter Harness (see harnessrouter.json), not in each task. */
export const UHP_VERSION = "2026-09-28";
export const DEFAULT_BASE_URL = "https://api.harnessrouter.ai";

export function buildPlanPrompt(req: PlanRequest) {
  const d = req.digest;
  const mode = req.demoMode ?? "live";
  const parts = [
    `Project name: ${req.projectName}`,
    req.liveUrl ? `Live URL: ${req.liveUrl}` : `No live link. Public GitHub repo: ${req.repoUrl}`,
    req.blurb ? `What it does (from the team): ${req.blurb}` : "",
    req.problem ? `The problem it solves (from the team): ${req.problem}` : "No problem statement from the team: only use one if the site or README states it.",
    req.evidence ? `Evidence (from the team: users, quotes, numbers, links): ${req.evidence}` : "No evidence from the team: the evidence section may only use the repo's public signals below (with their source), else omit it.",
    req.builtWith ? `Built with / why (from the team): ${req.builtWith}` : "",
    req.whatsNext ? `What's next (from the team): ${req.whatsNext}` : "No roadmap from the team: omit the next section unless the README or open issues state one.",
    req.ask ? `The ask (from the team): ${req.ask}` : `No ask from the team: the ask scene is "Try it at ${(req.liveUrl || req.repoUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "")}" (write the link without https://).`,
  ];
  if (d) {
    const digest = {
      final_url: d.finalUrl,
      home: { title: d.home.title, description: d.home.description, h1: d.home.h1, sections: d.home.sections.slice(0, 12), links: d.home.links.slice(0, 20), inputs: d.home.inputs, height: d.home.height },
      pages: d.pages.map((p) => ({ url: p.url, title: p.title, h1: p.h1, description: p.description, sections: p.sections.slice(0, 6) })),
    };
    parts.push(`Site digest we collected (verified headings, links and inputs; y = pixel offset from top):\n${JSON.stringify(digest)}`);
    if (mode === "live") parts.push("You may also open the live URL in your browser to verify selectors (max 8 page loads).");
  }
  if (req.repo) {
    parts.push(`Repository facts (read-only, from the GitHub API):\n${JSON.stringify(repoDigest(req.repo))}`);
    if (req.repo.readme.text) parts.push(`${req.repo.readme.path} (truncated):\n${req.repo.readme.text.slice(0, 5000)}`);
  } else if (req.readme) parts.push(`README (truncated):\n${req.readme.slice(0, 4000)}`);
  parts.push(modePrompt(req));
  if (req.topic) parts.push(topicRules(req.topic));
  if (req.lengthS) parts.push(lengthLine(req.lengthS));
  if (req.commits?.length) {
    const commits = req.commits.slice(0, 200).map((c) => `${c.date.slice(0, 10)} ${c.sha} ${c.message.split("\n")[0].slice(0, 120)}`);
    parts.push(`Repo: ${req.repoUrl}\nCommits (newest first):\n${commits.join("\n")}`);
  } else parts.push("No commits available: set build_log_md to null.");
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Files the agent can open in its workspace (input_file data URLs; input_image is not passed through).
 * Used for footage keyframes: small JPEGs, a few per clip.
 */
export function withAttachments(text: string, files?: { name: string; path: string }[]) {
  if (!files?.length) return text;
  return [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text },
        ...files.map((f) => ({ type: "input_file", filename: f.name, file_data: `data:image/jpeg;base64,${readFileSync(f.path).toString("base64")}` })),
      ],
    },
  ];
}

/** The demo-source part of the request. Footage and repository scenes are never presented as live. */
export function modePrompt(req: PlanRequest) {
  const mode = req.demoMode ?? "live";
  const target = req.liveUrl || req.repoUrl || "";
  const noRecord = `Set video_plan.flow to {"project_name": ..., "url": "${target}", "viewport": {"width":1280,"height":720}, "steps": [...]} with one goto step per demo scene to "${target}" (id = that scene's clip id or s1, s2…, say = its narration, hold_ms 3000): we do not record it.`;
  if (mode === "footage") {
    const clips = (req.footageClips ?? []).map((c) => `${c.id} (${c.duration_s.toFixed(1)} s)`).join(", ");
    const frames = req.footageFrames?.map((f) => f.name).join(", ");
    const imgs = (req.repoImages ?? []).map((i) => `${i.src} (${i.path}${i.alt ? `, "${i.alt}"` : ""})`).join("; ");
    return [
      `Demo mode: footage. The team uploaded their own footage; we cut its active parts into clips: ${clips}.`,
      frames
        ? `Attached in your workspace are frames from each clip (${frames}: start, middle and end of that clip). Look at every frame with your vision tool BEFORE writing narration. Each clip's narration must describe only what its frames show; the README and the team's text may name things, never add events that aren't in the frames.`
        : "Narrate from the README and the team's description, and never claim a detail you can't know from them.",
      `Each demo scene shows one clip: elements [{"type":"clip","step_id":"<clip id>","zoom":"none"}], in the order that tells the story best. Never call the footage live.`,
      imgs ? `You may add up to 2 extra demo scenes with README screenshots ({"type":"image","src":"<src>","fit":"contain"}), shown as "From the repository": ${imgs}.` : "",
      noRecord,
    ].filter(Boolean).join("\n");
  }
  if (mode === "sandbox-run") return sandboxPrompt(req.repoUrl ?? "");
  if (mode === "repo-showcase") {
    const imgs = (req.repoImages ?? []).map((i) => `${i.src} (${i.path}${i.alt ? `, "${i.alt}"` : ""})`).join("; ");
    const game = req.repo?.kind.startsWith("game-");
    return [
      `Demo mode: repo-showcase. Nothing is run: build the demo section from the repository. On screen it is labeled "From the repository", so never say "live" or "here it is running".`,
      imgs ? `Images we downloaded from the repo (use as {"type":"image","src":"<src>","fit":"contain"}, one per demo scene): ${imgs}.` : "The repo has no README images.",
      `Add 1–2 code-walkthrough scenes: {"type":"code","path":"<a file from the files list>","from":<first line>,"to":<last line, at most 20 lines later>,"highlight":[<a>,<b>]} with the lines that show the core idea; the server fills in the code. To choose lines, read the file in your sandbox (git clone --depth 1, or fetch raw.githubusercontent.com); never run the project.`,
      game ? "This is a game repo: never try to build or run the engine project." : "",
      noRecord,
    ].filter(Boolean).join("\n");
  }
  return "";
}

/** The team's length choice replaces the default 90–120s; the budget keeps sections in proportion. */
export function lengthLine(target: number) {
  const w = lengthWindow(target);
  const b = lengthBudget(target);
  return [
    `Target length (chosen by the team): about ${formatSeconds(w.target)}, so the scene durations must total ${w.min}–${w.max}s. This replaces the default 90–120s and the demo step counts in your instructions.`,
    `Rough budget: problem ~${b.problem}s, solution ~${b.solution}s, demo ~${b.demo}s in about ${b.demoSteps} steps (one scene each), next ~${b.next}s if you have a roadmap, end 3s.`,
    // Agents overshoot short targets (60 s runs came out at 77–81 s): give a hard word count too.
    `Word budget: at most ${Math.round(((w.min + w.max) / 2) * 2.3)} words of narration in total across all scenes (the voice speaks about 2.6 words per second plus pauses between scenes). Count them before you reply; cut optional sections first.`,
    target >= 120
      ? "For a longer video, show more of the product (more steps, more screens), and use two problem scenes if the story needs it. Never pad with filler."
      : target <= 45
        ? "For a short video: one problem scene, one solution sentence, the 3 strongest demo steps, no next section."
        : "",
  ]
    .filter(Boolean)
    .join("\n");
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

/** One readable line per agent tool call for the public job log (null hides it). */
export function describeToolCall(name: string, args: string): string | null {
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(args);
  } catch {
    /* partial or non-JSON arguments */
  }
  const url = typeof a.url === "string" ? a.url.slice(0, 120) : "";
  const tool = name.replace(/^mcp__\w+__/, "");
  if (/navigate|goto|open/i.test(tool)) return url ? `Agent opened ${url}` : "Agent opened a page";
  if (/screenshot|snapshot/i.test(tool)) return "Agent looked at the page";
  if (/click/i.test(tool)) return "Agent tried a click to check a selector";
  if (/type|fill/i.test(tool)) return "Agent tried typing into a field";
  if (/scroll/i.test(tool)) return "Agent scrolled the page";
  if (/memory_recall|recall|search_memor/i.test(tool)) return "Agent checked its notes from earlier videos";
  if (/memory_(store|save|write)|remember/i.test(tool)) return "Agent saved a note for next time";
  if (/search/i.test(tool)) return "Agent searched the web";
  if (/fetch|read/i.test(tool)) return url ? `Agent read ${url}` : "Agent read a page";
  return `Agent used ${tool.replace(/_/g, " ").slice(0, 40)}`;
}

export class HarnessRouterPlanner implements Planner {
  readonly name = "harnessrouter";
  constructor(private cfg: HarnessConfig) {}

  private async *call(body: Record<string, unknown>, repairsLeft = 1): AsyncIterable<PlannerEvent> {
    const f = this.cfg.fetchImpl ?? fetch;
    const base = (this.cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/v1$/, "");
    const res = await f(`${base}/v1/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "UHP-Version": UHP_VERSION,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        timeout_seconds: 420,
        ...body,
        ...(this.cfg.model ? { model: this.cfg.model } : {}),
        metadata: { harness_id: this.cfg.harnessId },
        stream: true,
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
      // The job page is public: log what the agent is doing in plain words, never response/memory ids.
      if (type === "response.created") yield { type: "log", message: "Agent started on HarnessRouter" };
      else if (type === "response.output_item.done") {
        const item = ev.item as { type?: string; name?: string; arguments?: string };
        if (item?.type === "function_call") {
          const line = describeToolCall(item.name ?? "", item.arguments ?? "");
          if (line) yield { type: "log", message: line };
        }
      } else if (type === "response.output_text.delta") text += String(ev.delta ?? "");
      else if (type === "error") yield { type: "log", message: `harness error: ${String(ev.message ?? "")}` };
      else if (type === "response.completed" || type === "response.incomplete" || type === "response.failed")
        final = ev.response as UhpResponse;
    }
    if (!final) throw new Error("HarnessRouter stream ended without a terminal event");
    if (final.status !== "completed") throw new Error(`HarnessRouter task ${final.status}: ${final.error?.message ?? ""}`);

    const hrSession = typeof final.metadata?.session_id === "string" ? final.metadata.session_id : undefined;
    const parsed = extractJson(messageText(final) || text) as {
      summary?: string;
      flow?: unknown;
      video_plan?: unknown;
      build_log_md?: string | null;
      submission_md?: string | null;
      research_queries?: unknown;
      judge_review?: { notes?: unknown };
      demo_mode?: unknown;
    };
    const demoMode = DemoModeSchema.safeParse(parsed.demo_mode).success ? (parsed.demo_mode as DemoMode) : undefined;
    const judgeNotes = Array.isArray(parsed.judge_review?.notes)
      ? parsed.judge_review.notes.filter((n): n is string => typeof n === "string").map((n) => n.slice(0, 200)).slice(0, 4)
      : undefined;
    const researchQueries = Array.isArray(parsed.research_queries)
      ? parsed.research_queries.filter((q): q is string => typeof q === "string" && q.trim().length > 3).map((q) => q.slice(0, 200)).slice(0, 3)
      : undefined;
    if (parsed.video_plan !== undefined) {
      const vp = VideoPlanSchema.safeParse(parsed.video_plan);
      if (!vp.success) {
        const issues = vp.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
        if (repairsLeft <= 0) throw new Error(`agent video_plan still invalid: ${issues.slice(0, 3).join("; ")}`);
        yield { type: "log", message: `video plan failed validation (${issues.length} issues); asking the agent to fix it` };
        yield* this.call(
          {
            input: `Your video_plan failed validation:\n- ${issues.join("\n- ")}\nFix exactly these problems and reply with the full JSON block again (same format).`,
            previous_response_id: final.id,
            ...(body.user ? { user: body.user } : {}),
          },
          repairsLeft - 1,
        );
        return;
      }
      yield {
        type: "plan",
        flow: vp.data.flow,
        videoPlan: vp.data,
        summary: parsed.summary,
        buildLog: parsed.build_log_md ?? undefined,
        submission: parsed.submission_md ?? undefined,
        sessionId: final.id,
        hrSessionId: hrSession,
        researchQueries,
        judgeNotes,
        demoMode,
        source: "harness",
      };
      return;
    }
    const flow = FlowSchema.parse(parsed.flow);
    yield { type: "plan", flow, summary: parsed.summary, buildLog: parsed.build_log_md ?? undefined, sessionId: final.id, hrSessionId: hrSession, source: "harness" };
  }

  plan(req: PlanRequest) {
    return this.call({ input: withAttachments(buildPlanPrompt(req), req.footageFrames), ...(req.user ? { user: req.user } : {}), ...(req.timeoutSeconds ? { timeout_seconds: req.timeoutSeconds } : {}) });
  }

  research(req: { sessionId: string; prompt: string; user?: string }) {
    return this.call({ input: req.prompt, previous_response_id: req.sessionId, ...(req.user ? { user: req.user } : {}) });
  }

  revise(req: PlanRequest & { sessionId?: string; previous: unknown; request: string }) {
    const input =
      `Revision request from the user: "${req.request}"\n` +
      `Change only what's needed and reply with the full JSON block again (same format). Keep build_log_md unless asked.`;
    const user = req.user ? { user: req.user } : {};
    // Follow-up on the same result: continue that session. Otherwise start a new task.
    if (req.sessionId) return this.call({ input, previous_response_id: req.sessionId, ...user });
    return this.call({ input: `${buildPlanPrompt(req)}\n\nPrevious flow:\n${JSON.stringify(req.previous)}\n\n${input}`, ...user });
  }
}
