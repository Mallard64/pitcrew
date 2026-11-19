/**
 * Guardrails for sensitive topics (mental health, health, finance, legal, children): detect the topic
 * from the README/description/team fields, add an on-screen disclaimer, and reject plans that claim
 * to treat, diagnose, cure or replace professionals, or make efficacy claims without a cited source.
 */
import type { Element, VideoPlan } from "../../harness/schemas/video_plan";

export type Topic = "mental-health" | "health" | "finance" | "legal" | "children";

const SIGNALS: [Topic, RegExp][] = [
  [
    "mental-health",
    /\b(mental health|therap(y|ist)|counsel(l)?ing|depress(ion|ed)|anxiety|wellbeing|well-being|mindfulness|suicid\w*|self-harm|mood (tracker|journal)|emotional support|ptsd|panic attacks?)\b/gi,
  ],
  [
    "health",
    /\b(medical|medicine|patients?|clinical|clinicians?|doctors?|symptoms?|diagnos\w*|disease|healthcare|health care|nutrition|medication|hospital|telehealth)\b/gi,
  ],
  [
    "finance",
    /\b(invest(ing|ment|or)s?|stocks?|trading|portfolio|crypto(currency)?|bitcoin|loans?|credit score|budget(ing)?|personal finance|retirement|taxes|financial advice)\b/gi,
  ],
  [
    "legal",
    /\b(legal advice|lawyers?|attorneys?|contracts? review|lawsuits?|immigration|tenant rights|court|litigation)\b/gi,
  ],
  [
    "children",
    /\b(kids|children|child|toddlers?|preschool(ers)?|parents of|K-?12|elementary school|COPPA)\b/gi,
  ],
];

/** The strongest sensitive topic in the text, if signals are clear (≥ 2 hits, or ≥ 1 for mental health). */
export function detectTopic(text: string): Topic | null {
  let best: { topic: Topic; n: number } | null = null;
  for (const [topic, re] of SIGNALS) {
    const n = (text.match(re) ?? []).length;
    const need = topic === "mental-health" ? 1 : 2;
    if (n >= need && (!best || n > best.n)) best = { topic, n };
  }
  return best?.topic ?? null;
}

export const DISCLAIMER: Record<Topic, string> = {
  "mental-health": "Not a substitute for professional care",
  health: "Not medical advice",
  finance: "Not financial advice",
  legal: "Not legal advice",
  children: "Designed with parents in the loop",
};

/** One line for the agent prompt. */
export function topicRules(topic: Topic) {
  const pro =
    topic === "finance"
      ? "financial advisor"
      : topic === "legal"
        ? "lawyer"
        : "doctor, therapist or other professional";
  return `Sensitive topic (${topic}): never say the product treats, diagnoses, cures, heals or replaces a ${pro}; no efficacy or outcome claims ("reduces anxiety by…", "improves returns") unless the team gave a cited source; describe what the product does, not what it achieves. The server adds the on-screen line "${DISCLAIMER[topic]}".`;
}

const BANNED: RegExp[] = [
  /\b(treat|treats|treating|treatment for|cure|cures|curing|heal|heals|healing|diagnose|diagnoses|diagnosing)\b/i,
  /\b(replace|replaces|replacing|instead of|no need for|better than)\b[^.!?]{0,40}\b(therapists?|doctors?|psychiatrists?|psychologists?|counsel(l)?ors?|clinicians?|professionals?|lawyers?|attorneys?|financial advisors?|advisers?)\b/i,
  /\b(guaranteed?|risk-free|proven to)\b/i,
];
/** Outcome claims: "reduces anxiety", "improves mental health by 40%", "beats the market". */
const EFFICACY =
  /\b(reduc(e|es|ing)|lower(s|ing)?|improv(e|es|ing)|boost(s|ing)?|eliminat(e|es|ing)|prevent(s|ing)?|beats?|outperform(s|ing)?)\b[^.!?]{0,40}\b(anxiety|depression|stress|symptoms?|suicid\w*|mental health|risk|returns?|the market|disease|blood pressure|weight)\b/i;

export type Violation = { scene: string; text: string; rule: string };

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean);

function textsOf(plan: VideoPlan): { scene: string; text: string }[] {
  const out: { scene: string; text: string }[] = [];
  for (const sc of plan.scenes) {
    for (const s of sentences(sc.narration)) out.push({ scene: sc.id, text: s });
    for (const el of sc.elements) {
      if (el.type === "text" || el.type === "kinetic_headline")
        out.push({ scene: sc.id, text: el.text });
      if (el.type === "bullets") for (const it of el.items) out.push({ scene: sc.id, text: it });
    }
  }
  return out;
}

/** Rule check for a plan on a sensitive topic. Efficacy claims pass only with a team-provided source. */
export function checkSensitive(plan: VideoPlan, topic: Topic | null): Violation[] {
  if (!topic) return [];
  const cited = plan.sources.some((s) => s.kind === "team-provided");
  const out: Violation[] = [];
  for (const t of textsOf(plan)) {
    if (BANNED.some((re) => re.test(t.text)))
      out.push({ ...t, rule: "claims to treat, diagnose, cure or replace a professional" });
    else if (!cited && EFFICACY.test(t.text))
      out.push({ ...t, rule: "outcome claim without a cited source" });
  }
  return out;
}

/** Last resort after a failed repair: remove the offending sentences / items. Returns how many. */
export function scrubSensitive(plan: VideoPlan, topic: Topic): number {
  const bad = new Set(checkSensitive(plan, topic).map((v) => v.text));
  if (!bad.size) return 0;
  for (const sc of plan.scenes) {
    sc.narration = sentences(sc.narration)
      .filter((s) => !bad.has(s))
      .join(" ");
    sc.elements = sc.elements.flatMap((el): Element[] => {
      if ((el.type === "text" || el.type === "kinetic_headline") && bad.has(el.text)) return [];
      if (el.type === "bullets") {
        const items = el.items.filter((it) => !bad.has(it));
        return items.length ? [{ ...el, items }] : [];
      }
      return [el];
    });
  }
  return bad.size;
}

export function sensitivePrompt(violations: Violation[], topic: Topic) {
  return [
    `Sensitive-topic review (${topic}). These lines break the rules:`,
    violations.map((v) => `- ${v.scene}: "${v.text}" (${v.rule})`).join("\n"),
    topicRules(topic),
    "Rewrite only those lines so they describe what the product does. Keep everything else exactly as it is. Reply with the full JSON block again (same format).",
  ].join("\n\n");
}
