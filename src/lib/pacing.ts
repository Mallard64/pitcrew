/**
 * Talking pace per scene. Scene length follows narration (fitSceneDuration), so the pace is the lever
 * that lands a video inside 60–90s: a long script is read faster, a short one a little slower.
 * Sections also vary slightly, like a human presenter: the problem lands calmly, the demo moves.
 */

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
  target = { min: 62, max: 86 },
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
