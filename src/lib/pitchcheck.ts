/**
 * Pitch check: does the narration work for a hackathon judge watching 60–90 seconds?
 * 1. checkPitch: deterministic rules (hook, specific problem, product named, real demo, length, plain words).
 * 2. judgePrompt + mergeJudgeRewrite: one follow-up turn in the same agent session where the agent reads
 *    its script as a judge and rewrites only the words. Flow, clips, stats and sources never change here,
 *    and the server keeps the rewrite only if the rules score doesn't drop.
 */
import type { VideoPlan } from "../../harness/schemas/video_plan";
import { NATURAL_WPS } from "./pacing";

export type PitchCheck = { id: string; label: string; ok: boolean; detail: string };
export type PitchReport = {
  score: number;
  total: number;
  checks: PitchCheck[];
  judge?: { notes: string[]; rewritten: boolean };
};

const HYPE =
  /\b(revolutionary|revolutioni[sz]e|game[- ]chang\w*|cutting[- ]edge|seamless(ly)?|leverag\w+|synerg\w+|world[- ]class|next[- ]gen(eration)?|supercharg\w+|effortless(ly)?|unlock\w*|disrupt\w*|best[- ]in[- ]class|innovative)\b/gi;

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);
const sentences = (t: string) =>
  t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Rough spoken length: narration at the natural pace plus per-scene beats and the end card. */
export function estimateSeconds(plan: VideoPlan) {
  return Math.round(
    plan.scenes.reduce(
      (s, sc) =>
        s +
        (sc.section === "end"
          ? 2.5
          : sc.narration.trim()
            ? words(sc.narration).length / NATURAL_WPS + 1
            : 3),
      0,
    ),
  );
}

export function checkPitch(plan: VideoPlan, projectName: string): PitchReport {
  const by = (section: string) => plan.scenes.filter((s) => s.section === section);
  const first = plan.scenes.find((s) => s.narration.trim());
  const opener = first ? (sentences(first.narration)[0] ?? "") : "";
  const problem = by("problem");
  const solution = by("solution");
  const demo = by("demo");
  const all = plan.scenes.map((s) => s.narration).join(" ");
  const hype = [...new Set((all.match(HYPE) ?? []).map((w) => w.toLowerCase()))];
  const long = plan.scenes
    .flatMap((s) => sentences(s.narration))
    .filter((s) => words(s).length > 26);
  const secs = estimateSeconds(plan);
  const name = projectName.trim().toLowerCase();
  const namesProduct = [...solution, ...demo.slice(0, 1)].some((s) =>
    s.narration.toLowerCase().includes(name),
  );
  const lastDemo = demo.at(-1);

  const checks: PitchCheck[] = [
    {
      id: "hook",
      label: "Opens with a hook, not the product name",
      ok:
        !!opener &&
        words(opener).length <= 18 &&
        !/^(introducing|meet|welcome|hi|hello|this is)\b/i.test(opener) &&
        !opener.toLowerCase().startsWith(name),
      detail: opener ? `First line: “${opener.slice(0, 120)}”` : "No narration in the first scene",
    },
    {
      id: "problem",
      label: "States a specific problem",
      ok: problem.some((s) => words(s.narration).length >= 10),
      detail: problem.length
        ? `${words(problem.map((s) => s.narration).join(" ")).length} words on the problem`
        : "No problem scene",
    },
    {
      id: "named",
      label: "Names the product when it introduces the fix",
      ok: namesProduct,
      detail: namesProduct
        ? `“${projectName}” is said in the solution`
        : `The solution never says “${projectName}”, so judges may not remember it`,
    },
    {
      id: "demo",
      label: "Shows a real demo (3+ recorded steps)",
      ok: demo.length >= 3,
      detail: `${demo.length} demo scene${demo.length === 1 ? "" : "s"}`,
    },
    {
      id: "wow",
      label: "Demo ends on a payoff line",
      ok: !!lastDemo && words(lastDemo.narration).length >= 6,
      detail: lastDemo ? `Last demo line: “${lastDemo.narration.slice(0, 100)}”` : "No demo",
    },
    {
      id: "length",
      label: "Fits 60–90 seconds",
      ok: secs >= 55 && secs <= 95,
      detail: `About ${secs}s before pacing (the voice pace adjusts ±15%)`,
    },
    {
      id: "plain",
      label: "No hype words",
      ok: hype.length === 0,
      detail: hype.length ? `Found: ${hype.join(", ")}` : "Plain language throughout",
    },
    {
      id: "short",
      label: "Sentences short enough to follow by ear",
      ok: long.length === 0,
      detail: long.length ? `${long.length} sentence(s) over 26 words` : "All sentences ≤ 26 words",
    },
  ];
  return { score: checks.filter((c) => c.ok).length, total: checks.length, checks };
}

/** The follow-up turn: the agent critiques its own script as a judge and rewrites only the words. */
export function judgePrompt(plan: VideoPlan, report: PitchReport, projectName: string) {
  const failing = report.checks.filter((c) => !c.ok).map((c) => `- ${c.label}: ${c.detail}`);
  const script = plan.scenes.map((s) => ({ id: s.id, section: s.section, narration: s.narration }));
  return [
    `Pitch review. Read this script as a hackathon judge who watches 40 demo videos in a row and decides in the first 10 seconds whether to pay attention.`,
    `Judges reward: a hook in the first sentence (a concrete situation, not the product name), one specific problem in the user's words, "${projectName}" named as the fix in one clear sentence, a demo where every line says what the viewer sees and why it matters, and a demo that ends on its strongest moment.`,
    `Judges punish: hype words, vague claims, long sentences, features not shown, and invented numbers.`,
    failing.length
      ? `Our automatic checks flagged:\n${failing.join("\n")}`
      : `Our automatic checks passed; still tighten anything a judge would skim past.`,
    `Current script:\n${JSON.stringify(script)}`,
    `Rules for the rewrite: change narration (and headline text) only. Keep every scene id, section, layout, element type, clip, stat element, source and the flow exactly as they are. Demo narration must still describe what that recorded step shows, ≤ 25 words. Keep total words within ±10% so the length stays 60–90s. Never add a number that is not already in the script.`,
    `Reply with the full JSON block again (same format as before), plus a top-level "judge_review": {"notes": ["≤ 4 short notes on what you changed and why"]}.`,
  ].join("\n\n");
}

/**
 * Takes only words from the rewritten plan: narration per scene id, and headline/text/bullet strings
 * when the element list has the same shape. Everything else stays from the original.
 */
export function mergeJudgeRewrite(original: VideoPlan, rewritten: VideoPlan): VideoPlan {
  const out: VideoPlan = structuredClone(original);
  const byId = new Map(rewritten.scenes.map((s) => [s.id, s]));
  for (const sc of out.scenes) {
    const r = byId.get(sc.id);
    if (!r || r.section !== sc.section) continue;
    if (r.narration.trim() && (sc.section !== "demo" || words(r.narration).length <= 25))
      sc.narration = r.narration.trim();
    if (r.elements.length !== sc.elements.length) continue;
    sc.elements = sc.elements.map((el, i) => {
      const re = r.elements[i];
      if (re.type !== el.type) return el;
      if (el.type === "kinetic_headline" && re.type === "kinetic_headline")
        return { ...el, text: re.text };
      if (el.type === "text" && re.type === "text") return { ...el, text: re.text };
      if (el.type === "bullets" && re.type === "bullets") return { ...el, items: re.items };
      return el;
    });
  }
  return out;
}

export function pitchCheckMarkdown(projectName: string, r: PitchReport) {
  const lines = [`# ${projectName}: pitch check`, "", `Score: ${r.score}/${r.total}`, ""];
  for (const c of r.checks) lines.push(`- ${c.ok ? "✅" : "⚠️"} **${c.label}**: ${c.detail}`);
  if (r.judge?.notes.length)
    lines.push(
      "",
      r.judge.rewritten
        ? "## Judge pass (applied)"
        : "## Judge pass (not applied: it scored lower)",
      "",
      ...r.judge.notes.map((n) => `- ${n}`),
    );
  return lines.join("\n") + "\n";
}
