/**
 * Pitch Room: three cheap agents each rewrite the narration of the SAME scenes from a different angle,
 * one strong judge agent scores them per outline section, and the best one goes into the normal pipeline.
 * Text only: no site exploration per competitor (they all get the notes the main plan already gathered),
 * no merge step and no extra rendering. Any number our claim checker can't find in the notes caps a draft at 5.
 */
import { z } from "zod";
import { extractJson } from "./harness/real";
import { NUMBER_IN_TEXT, checkStatInText } from "./research/verify";

export const ANGLES = ["customer story", "data-first", "demo-first"] as const;
export type Angle = (typeof ANGLES)[number];
export type Usage = Record<string, number>;
/** One agent task that returns its final text (UHP /v1/responses, no previous_response_id). */
export type TaskFn = (input: string, opts: { model?: string; timeoutSeconds: number }) => Promise<{ text: string; usage?: Usage }>;

export type RoomScene = { id: string; section: string; narration: string; duration_s: number; shows?: string };
export type RoomDraft = {
  angle: Angle;
  model: string;
  ok: boolean;
  error?: string;
  scenes: { id: string; narration: string }[];
  words: number;
  /** Judge's per-section scores (1–10), mean of them (capped at 5 with unverified claims), one-line reason. */
  scores?: Record<string, number>;
  total?: number;
  reason?: string;
  unverified?: string[];
};
export type PitchRoomResult = {
  drafts: RoomDraft[];
  winner: number;
  /** The draft the team picked instead (index), if any. */
  chosen?: number;
  draftModel: string;
  judgeModel: string;
  ms: number;
  usage: Usage;
};

const MAX_WORDS = 300;
const CHEAP = ["claude-haiku-5.5", "claude-haiku-4.5", "gpt-5.4-mini", "gemini-3.8-flash", "gemini-3.7-flash"];
const STRONG = ["claude-fable-5-2", "claude-opus-5.5", "gpt-6.2-sol", "claude-sonnet-5.5"];

/**
 * GET /v1/harnesses/{id}/models lists ids without prices, so "cheapest" and "strongest" are fixed preference
 * lists filtered by what this Harness allows (env overrides win). Undefined = the Harness default model.
 */
export function pickModels(available: string[], env: Record<string, string | undefined> = process.env) {
  const has = (m: string) => available.includes(m);
  return {
    draft: env.PITCH_ROOM_DRAFT_MODEL || CHEAP.find(has),
    judge: env.PITCH_ROOM_JUDGE_MODEL || STRONG.find(has),
  };
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

const ANGLE_HOW: Record<Angle, string> = {
  "customer story": "Tell it as one user's story: who hits the problem, what they try, how this product changes their day.",
  "data-first": "Lead with the most concrete facts in the notes (numbers, sources, what was built) and keep every line precise. Never add a number that isn't in the notes.",
  "demo-first": "Get to the product fast: one short problem line, then let the demo scenes carry the pitch with vivid, specific narration of what's on screen.",
};

export function draftPrompt(angle: Angle, notes: string, scenes: RoomScene[]) {
  return [
    `PITCH ROOM TASK (text only). Ignore your usual video_plan output format and do not open any pages or tools: everything you need is below.`,
    `You are one of three writers competing for the best demo-day pitch. Your angle: ${angle}. ${ANGLE_HOW[angle]}`,
    `Rewrite the narration of these scenes. Keep every scene id; keep each scene about its duration (≈2.5 words per second); demo scenes must still describe what their step shows. At most ${MAX_WORDS} words in total. Use only facts in the notes: no invented users, numbers, quotes or features.`,
    `Scenes:\n${JSON.stringify(scenes.map((s) => ({ id: s.id, section: s.section, seconds: s.duration_s, shows: s.shows, current: s.narration })))}`,
    `Notes about the project (gathered once, shared by all writers):\n${notes}`,
    'Reply with only this JSON: {"scenes":[{"id":"<scene id>","narration":"<text>"}]}',
  ].join("\n\n");
}

export function parseDraft(text: string, sceneIds: string[]): { id: string; narration: string }[] {
  const raw = extractJson(text) as { scenes?: unknown };
  const parsed = z.array(z.object({ id: z.string(), narration: z.string() })).parse(raw.scenes);
  const byId = new Map(parsed.map((s) => [s.id, s.narration.trim().slice(0, 400)]));
  const scenes = sceneIds.filter((id) => byId.get(id)).map((id) => ({ id, narration: byId.get(id)! }));
  if (scenes.length < Math.ceil(sceneIds.length / 2)) throw new Error("draft covered too few scenes");
  return scenes;
}

/** Numbers in a draft that the claim checker can't find in the shared notes. */
export function unverifiedClaims(narration: string, grounding: string): string[] {
  const nums = [...new Set(narration.match(NUMBER_IN_TEXT) ?? [])];
  return nums.filter((n) => !checkStatInText(grounding, Number(n.replace(/,/g, ""))).ok);
}

export function judgePrompt(sections: string[], drafts: RoomDraft[], scenes: RoomScene[]) {
  const list = drafts.map((d, i) => ({
    draft: i + 1,
    scenes: d.scenes.map((s) => ({ section: scenes.find((x) => x.id === s.id)?.section, narration: s.narration })),
  }));
  return [
    `PITCH ROOM JUDGE TASK (text only). Ignore your usual video_plan output format and do not use any tools.`,
    `You are a strict demo-day judge. Score each draft 1–10 on each outline section it covers (${sections.join(", ")}): clarity, specificity, and whether it makes a judge want to try the product. Penalize vague hype and any claim that sounds invented.`,
    `Drafts:\n${JSON.stringify(list)}`,
    'Reply with only this JSON (reason ≤ 20 words; total = mean of the section scores): {"drafts":[{"draft":1,"scores":{"<section>":7},"reason":"...","total":7.0}],"winner":1}',
  ].join("\n\n");
}

const JudgeSchema = z.object({
  drafts: z.array(
    z.object({
      draft: z.number().int().min(1),
      scores: z.record(z.string(), z.number().min(1).max(10)),
      reason: z.string(),
      total: z.number().optional(),
    }),
  ),
  winner: z.number().int().min(1),
});
export type JudgeReply = z.infer<typeof JudgeSchema>;

/** Strict parse of the judge's reply; throws when it isn't the expected JSON. */
export function parseJudge(text: string, count: number): JudgeReply {
  const j = JudgeSchema.parse(extractJson(text));
  if (j.winner > count) throw new Error("judge picked a draft that doesn't exist");
  return j;
}

/**
 * Applies the judge's scores and our claim cap, then picks the winner (highest total; the judge's
 * own pick breaks ties). Returns -1 when no draft is usable.
 */
export function scoreDrafts(drafts: RoomDraft[], judge: JudgeReply, okIdx: number[], grounding: string) {
  for (const [k, i] of okIdx.entries()) {
    const d = drafts[i];
    d.unverified = unverifiedClaims(d.scenes.map((s) => s.narration).join(" "), grounding);
    const j = judge.drafts.find((x) => x.draft === k + 1);
    const vals = j ? Object.values(j.scores) : [];
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    d.scores = j?.scores;
    d.reason = j?.reason.slice(0, 160);
    d.total = Math.round((d.unverified.length ? Math.min(mean, 5) : mean) * 10) / 10;
  }
  let best = -1;
  for (const i of okIdx) {
    const t = drafts[i].total ?? 0;
    const bt = best < 0 ? -1 : (drafts[best].total ?? 0);
    if (t > bt || (t === bt && okIdx[judge.winner - 1] === i)) best = i;
  }
  return best;
}

function addUsage(total: Usage, u?: Usage) {
  for (const [k, v] of Object.entries(u ?? {})) if (typeof v === "number") total[k] = (total[k] ?? 0) + v;
}

const isRateLimit = (e: unknown) => /\b429\b|too many requests|rate.?limit/i.test((e as Error).message);

/** One retry after 30 s on a 429 (the provider usually clears quickly). */
async function withRetry<T>(fn: () => Promise<T>, wait: (ms: number) => Promise<void>, retryMs: number): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isRateLimit(e)) throw e;
    await wait(retryMs);
    return fn();
  }
}

/** Runs the room. Returns null when every draft (or the judge) failed: the caller keeps the normal script. */
export async function runPitchRoom(o: {
  task: TaskFn;
  models: { draft?: string; judge?: string };
  scenes: RoomScene[];
  notes: string;
  log: (m: string) => void;
  wait?: (ms: number) => Promise<void>;
  staggerMs?: number;
  retryMs?: number;
}): Promise<PitchRoomResult | null> {
  const wait = o.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const stagger = o.staggerMs ?? 5000;
  const retryMs = o.retryMs ?? Number(process.env.AGENT_RETRY_MS ?? 30000);
  const started = Date.now();
  const usage: Usage = {};
  const ids = o.scenes.map((s) => s.id);
  const draftModel = o.models.draft ?? "harness default";
  const judgeModel = o.models.judge ?? "harness default";

  const drafts: RoomDraft[] = await Promise.all(
    ANGLES.map(async (angle, i): Promise<RoomDraft> => {
      await wait(i * stagger);
      try {
        const r = await withRetry(() => o.task(draftPrompt(angle, o.notes, o.scenes), { model: o.models.draft, timeoutSeconds: 180 }), wait, retryMs);
        addUsage(usage, r.usage);
        const scenes = parseDraft(r.text, ids);
        const w = words(scenes.map((s) => s.narration).join(" "));
        o.log(`Pitch Room: the ${angle} draft is in (${w} words)`);
        return { angle, model: draftModel, ok: true, scenes, words: w };
      } catch (e) {
        o.log(`Pitch Room: the ${angle} draft failed (${(e as Error).message.slice(0, 120)})`);
        return { angle, model: draftModel, ok: false, error: (e as Error).message.slice(0, 200), scenes: [], words: 0 };
      }
    }),
  );
  const okIdx = drafts.map((d, i) => (d.ok ? i : -1)).filter((i) => i >= 0);
  if (!okIdx.length) {
    o.log("Pitch Room: every draft failed; continuing with the normal script");
    return null;
  }

  const sections = [...new Set(o.scenes.map((s) => s.section))];
  let judge: JudgeReply;
  try {
    const r = await withRetry(() => o.task(judgePrompt(sections, okIdx.map((i) => drafts[i]), o.scenes), { model: o.models.judge, timeoutSeconds: 180 }), wait, retryMs);
    addUsage(usage, r.usage);
    judge = parseJudge(r.text, okIdx.length);
  } catch (e) {
    o.log(`Pitch Room: the judge failed (${(e as Error).message.slice(0, 120)}); continuing with the normal script`);
    return null;
  }
  const grounding = [o.notes, ...o.scenes.map((s) => s.narration)].join("\n");
  const winner = scoreDrafts(drafts, judge, okIdx, grounding);
  if (winner < 0) return null;
  o.log(`Pitch Room: the judge picked the ${drafts[winner].angle} draft (${drafts[winner].total}/10)`);
  return { drafts, winner, draftModel, judgeModel, ms: Date.now() - started, usage };
}
