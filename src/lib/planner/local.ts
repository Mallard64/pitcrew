/**
 * Deterministic planner that needs no LLM: builds a click-flow and narration from the site digest.
 * Used in HARNESS_MODE=mock and as the fallback when the HarnessRouter agent returns an invalid plan.
 * Narration only restates copy found on the site (or the user's blurb), so it can't invent features.
 */
import type { Flow, Step } from "../../../harness/schemas/flow";
import { estimateSeconds } from "../../../harness/scripts/tts/providers";
import type { PageDigest, SiteDigest } from "../explore";

export type PlanInput = { projectName: string; liveUrl: string; blurb?: string };
export type Revision = { shorter?: boolean; longer?: boolean; focus?: string };

const MAX_SAY_WORDS = 25;

export function clampWords(text: string, max = MAX_SAY_WORDS) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= max) return words.join(" ");
  // Prefer cutting at a sentence end inside the limit.
  const cut = words.slice(0, max).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 30 ? cut.slice(0, end + 1) : cut.replace(/[,;:\-–—]+$/, "") + ".";
}

/** True for human prose; false for nav soup, class names, smashed-together labels. */
export function isProse(t: string) {
  const words = t.trim().split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;
  if (words.some((w) => w.length > 20)) return false;
  const wordy = words.filter((w) => /^[("'“]?[A-Za-z][a-z'’]*[-a-z]*[)"'”.,;:!?]*$/.test(w)).length;
  return wordy / words.length >= 0.75;
}

const firstSentence = (t: string) => (t.match(/^.{20,200}?[.!?](\s|$)/)?.[0] ?? t).trim();
const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

export function holdFor(say: string) {
  return Math.round(Math.min(8000, Math.max(2500, estimateSeconds(say) * 1000 + 900)));
}

export function parseRevision(request: string): Revision {
  const r = request.toLowerCase();
  const focus = r.match(/focus (?:on|more on)\s+(?:the\s+)?([a-z0-9 \-]{3,40})/)?.[1]?.trim();
  return {
    shorter: /(short|brief|quick|trim|cut|less)/.test(r),
    longer: /(long|more detail|expand|slower)/.test(r),
    focus,
  };
}

function scrollSteps(page: PageDigest, max: number, focus?: string) {
  const below = page.sections
    .filter((s) => s.y > 500 && s.y < page.height - 200)
    .map((s) => ({ ...s, text: isProse(s.text) ? s.text : "" }))
    .filter((s) => s.text || s.heading.split(/\s+/).length >= 4);
  const ranked = focus
    ? [...below].sort((a, b) => Number(b.heading.toLowerCase().includes(focus)) - Number(a.heading.toLowerCase().includes(focus)))
    : below;
  const picked = ranked.slice(0, max).sort((a, b) => a.y - b.y);
  // Spread out: skip sections closer than ~half a screen to the previous one.
  const out: typeof picked = [];
  for (const s of picked) if (!out.length || s.y - out[out.length - 1].y > 360) out.push(s);
  return out;
}

export function planLocally(input: PlanInput, digest: SiteDigest, rev: Revision = {}): Flow {
  const { home } = digest;
  const name = input.projectName;
  const steps: Step[] = [];
  const add = (s: Omit<Step, "id" | "hold_ms">) => {
    const say = clampWords(s.say);
    steps.push({ ...s, say, id: `s${steps.length + 1}`, hold_ms: holdFor(say) } as Step);
  };

  const pitch = input.blurb?.trim() || [home.description, home.h1, home.title].find((t) => t && isProse(t)) || home.h1 || home.title;
  add({ action: "goto", url: digest.finalUrl, say: pitch && pitch.trim().toLowerCase() !== name.trim().toLowerCase() ? `Meet ${name}. ${sentence(pitch)}` : `Meet ${name}. Here is a quick tour of the live site.` });

  const budget = rev.shorter ? 2 : rev.longer ? 5 : 4;
  let scrolledTo = 0;
  for (const s of scrollSteps(home, budget, rev.focus)) {
    const target = Math.max(0, s.y - 120);
    const body = s.text ?? "";
    add({ action: "scroll", y: target - scrolledTo, say: `${sentence(s.heading)} ${body}` });
    scrolledTo = target;
  }

  const input0 = home.inputs[0];
  if (input0 && !rev.shorter) {
    add({ action: "scroll", y: -scrolledTo, say: `Here's where you start, right on the home page.` });
    scrolledTo = 0;
    add({ action: "type", selector: input0.selector, text: "a quick demo example", say: `Type in a request and ${name} takes it from there.` });
  }

  const pages = [...digest.pages];
  if (rev.focus) pages.sort((a, b) => Number((b.h1 + b.title).toLowerCase().includes(rev.focus!)) - Number((a.h1 + a.title).toLowerCase().includes(rev.focus!)));
  for (const p of pages.slice(0, rev.shorter ? 1 : 2)) {
    const what = p.h1 || p.title;
    const detail = [p.description, ...p.sections.map((s) => s.text)].find((t) => t && isProse(t)) ?? "";
    add({ action: "goto", url: p.url, say: `${sentence(what)} ${detail}` });
    const sub = scrollSteps(p, 1)[0];
    if (sub && !rev.shorter) add({ action: "scroll", y: Math.max(0, sub.y - 120), say: `${sentence(sub.heading)} ${sub.text ?? ""}` });
  }

  // App-like sites (canvas, dashboards) have little copy; still give the viewer a few beats.
  const extras = [home.description, home.h1, ...digest.pages.map((p) => p.description)]
    .filter((t): t is string => !!t && isProse(t))
    .filter((t, i, a) => a.indexOf(t) === i && !steps.some((st) => st.say.includes(firstSentence(t).slice(0, 40))));
  const minSteps = rev.shorter ? 3 : 4;
  if (steps.length < minSteps && home.height > 1000) add({ action: "scroll", y: Math.min(700, home.height - 720), say: `Here's more of ${name}.` });
  for (const t of extras) {
    if (steps.length >= minSteps) break;
    add({ action: "wait", say: t });
  }
  if (steps.length < minSteps) add({ action: "wait", say: `Here is the ${name} interface, live at its public link.` });

  const host = new URL(digest.finalUrl).host.replace(/^www\./, "");
  add({ action: "goto", url: digest.finalUrl, say: `That's ${name}. Try it yourself at ${host}.` });

  return { project_name: name, url: digest.finalUrl, viewport: { width: 1280, height: 720 }, steps: steps.slice(0, 12) };
}
