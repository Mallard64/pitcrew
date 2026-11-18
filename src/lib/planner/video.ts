/**
 * Builds a video plan (problem → solution → demo → next → end) from a demo flow.
 * Used by the offline planner, and to repair an agent plan whose demo scenes lost their clips.
 * Every sentence comes from the form, the site's own copy, or the flow's narration.
 */
import type { Flow } from "../../../harness/schemas/flow";
import type { Scene, VideoPlan } from "../../../harness/schemas/video_plan";
import { estimateSeconds } from "../../../harness/scripts/tts/providers";
import type { SiteDigest } from "../explore";
import { clampWords, isProse } from "./local";

export type VideoInput = { projectName: string; liveUrl: string; blurb?: string; problem?: string; whatsNext?: string };

/** Deterministic PRNG so a seed always reproduces the same choices. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRANSITIONS = ["fade", "slide", "wipe"];

/** Picks a transition per cut; never the same one 3 times in a row. */
export function pickTransitions(n: number, rand: () => number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let t = TRANSITIONS[Math.floor(rand() * TRANSITIONS.length)];
    if (out.length >= 2 && out[out.length - 1] === t && out[out.length - 2] === t) t = TRANSITIONS[(TRANSITIONS.indexOf(t) + 1) % TRANSITIONS.length];
    out.push(t);
  }
  return out;
}

const sceneSeconds = (narration: string, min = 2.5) => Math.round(Math.max(min, estimateSeconds(narration) + 0.8) * 10) / 10;

export function localVideoPlan(input: VideoInput, flow: Flow, digest: SiteDigest | undefined, seed: number): VideoPlan {
  const name = input.projectName;
  const host = (() => {
    try {
      return new URL(flow.url).host.replace(/^www\./, "");
    } catch {
      return flow.url;
    }
  })();
  const scenes: Omit<Scene, "transition_in">[] = [];

  if (input.problem?.trim()) {
    const p = clampWords(input.problem, 30);
    scenes.push({ id: "problem", section: "problem", layout: "big-statement", duration_s: sceneSeconds(p, 4), narration: p, elements: [{ type: "kinetic_headline", text: clampWords(input.problem, 12), animation: "word-by-word" }] });
  }

  const pitch = input.blurb?.trim() || [digest?.home.description, digest?.home.h1].find((t) => t && isProse(t)) || "";
  const solution = clampWords(pitch ? `${name}. ${pitch}` : `This is ${name}.`, 30);
  scenes.push({
    id: "solution",
    section: "solution",
    layout: "big-statement",
    duration_s: sceneSeconds(solution, 4),
    narration: solution,
    elements: [
      { type: "kinetic_headline", text: name, animation: "word-by-word" },
      ...(pitch ? [{ type: "text" as const, text: clampWords(pitch, 18), role: "body" as const }] : []),
    ],
  });

  // Demo: one scene per recorded step (skip a closing "back to home" step; the end card covers it).
  const steps = flow.steps.filter((s, i) => !(i === flow.steps.length - 1 && s.action === "goto" && s.url === flow.url && flow.steps.length > 2));
  const seen = (t: string) => !!pitch && t.replace(/\W+/g, " ").toLowerCase().includes(clampWords(pitch, 6).replace(/\W+/g, " ").toLowerCase().trim());
  for (const [i, s0] of steps.entries()) {
    // Don't say the solution sentence twice: the first demo step often restates it.
    const s = i === 0 && seen(s0.say) ? { ...s0, say: `Here's ${name}, live.` } : s0;
    const zoom = s.zoom || s.action === "click" || s.action === "type" ? "target" : "none";
    scenes.push({ id: `demo_${s.id}`, section: "demo", layout: zoom === "target" ? "framed-zoom" : "full-frame", duration_s: Math.max(s.hold_ms / 1000, sceneSeconds(s.say)), narration: s.say, elements: [{ type: "clip", step_id: s.id, zoom }] });
  }

  const next = (input.whatsNext ?? "")
    .split(/\n|;|•/)
    .map((x) => x.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((x) => x.length > 2)
    .slice(0, 3);
  if (next.length) {
    const narration = clampWords(`What's next: ${next.join(", ")}.`, 30);
    scenes.push({ id: "next", section: "next", layout: "bullet-reveal", duration_s: sceneSeconds(narration, 4), narration, elements: [{ type: "bullets", items: next.map((x) => clampWords(x, 8)), animation: "slide-up" }] });
  }

  const end = `Try ${name} at ${host}.`;
  scenes.push({ id: "end", section: "end", layout: "end-card", duration_s: sceneSeconds(end, 3), narration: end, elements: [] });

  const transitions = pickTransitions(scenes.length, mulberry32(seed));
  return {
    version: 1,
    seed,
    style_kit: "default",
    brand: { primary: "#6366f1" },
    size: { width: 1280, height: 720 },
    fps: 30,
    music: null,
    credit: true,
    scenes: scenes.map((s, i) => ({ ...s, transition_in: transitions[i] })),
    flow,
    sources: [],
  };
}
