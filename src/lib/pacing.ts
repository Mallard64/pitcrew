/**
 * Talking pace per scene. Scene length follows narration (fitSceneDuration), so the pace is the lever
 * that lands a video inside its length window (60–90s by default, or the team's target from 30s to 3 min):
 * a long script is read faster, a short one a little slower.
 * Sections also vary slightly, like a human presenter: the problem lands calmly, the demo moves.
 */

/** Team-chosen target length, in seconds. No target means the default 60–90s pitch. */
export const MIN_TARGET_S = 30;
export const MAX_TARGET_S = 180;
export const DEFAULT_TARGET_S = 75;

export type LengthWindow = { target: number; min: number; max: number };

/** The window pacing aims for. The default is the original 62–86s; a team target gets ±15% (at least ±6s). */
export function lengthWindow(target?: number): LengthWindow {
  if (!target) return { target: DEFAULT_TARGET_S, min: 62, max: 86 };
  const t = Math.min(MAX_TARGET_S, Math.max(MIN_TARGET_S, target));
  const slack = Math.max(6, t * 0.15);
  return { target: t, min: Math.round(t - slack), max: Math.round(t + slack) };
}

/** What still counts as on target after voicing (pace is clamped, so allow a little more). */
export function acceptableRange(target?: number) {
  if (!target) return { min: 60, max: 90 };
  const w = lengthWindow(target);
  return { min: Math.floor(w.min * 0.92), max: Math.ceil(w.max * 1.06) };
}

export const formatSeconds = (s: number) =>
  s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** How the agent should split a target length across sections (sent with the plan request). */
export function lengthBudget(target: number) {
  const t = lengthWindow(target).target;
  const demo = Math.round(t * 0.55);
  return {
    problem: Math.round(t * 0.15),
    solution: Math.round(t * 0.13),
    demo,
    demoSteps: Math.min(12, Math.max(3, Math.round(demo / 8))),
    next: Math.round(t * 0.12),
  };
}

/** Words per second at pace 1 (ElevenLabs speed 0.85, measured). */
export const NATURAL_WPS = 3.0;
const SECTION_PACE: Record<string, number> = {
  problem: 0.95,
  solution: 1.0,
  demo: 1.06,
  next: 1.0,
};
const MIN_PACE = 0.88;
const MAX_PACE = 1.25;

type SceneLike = { id: string; section: string; narration: string };

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Seconds the video spends outside narration: lead + beat per voiced scene, plus the end card. */
function overhead(scenes: SceneLike[]) {
  return scenes.reduce(
    (s, sc) =>
      s +
      (sc.section === "end" ? 2.5 : sc.narration.trim() ? (sc.section === "demo" ? 0.75 : 1.0) : 3),
    0,
  );
}

/** Estimated video length at a base pace. */
export function estimateLength(scenes: SceneLike[], base: number) {
  const voiced = scenes.reduce(
    (s, sc) => s + words(sc.narration) / (NATURAL_WPS * base * (SECTION_PACE[sc.section] ?? 1)),
    0,
  );
  return voiced + overhead(scenes);
}

/** Base pace that puts the estimate inside [target.min, target.max], clamped to a range that still sounds natural. */
export function choosePace(
  scenes: SceneLike[],
  target: { min: number; max: number } = lengthWindow(),
): { base: number; perScene: Map<string, number>; estimate: number } {
  let base = 1;
  const at1 = estimateLength(scenes, 1);
  if (at1 > target.max || at1 < target.min) {
    // The voiced part scales with 1/pace; solve for the nearer bound, then clamp.
    const fixed = overhead(scenes);
    const voicedAt1 = at1 - fixed;
    const want = (at1 > target.max ? target.max : target.min) - fixed;
    base = want > 0 ? voicedAt1 / want : MAX_PACE;
  }
  base = Math.round(Math.min(MAX_PACE, Math.max(MIN_PACE, base)) * 100) / 100;
  const perScene = new Map(
    scenes.map((sc) => [sc.id, Math.round(base * (SECTION_PACE[sc.section] ?? 1) * 100) / 100]),
  );
  return { base, perScene, estimate: Math.round(estimateLength(scenes, base) * 10) / 10 };
}
