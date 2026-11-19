import { describe, expect, it } from "vitest";
import { acceptableRange, choosePace, formatSeconds, lengthBudget, lengthWindow } from "../src/lib/pacing";
import { JobFormSchema } from "../src/lib/validate";
import { lengthLine } from "../src/lib/harness/real";
import { checkPitch } from "../src/lib/pitchcheck";
import { applyTeamChoices } from "../src/lib/pipeline";
import { loupeLayout, panelBox } from "../remotion/Scene";
import type { VideoPlan } from "../harness/schemas/video_plan";

const form = { project_name: "Acme", live_url: "https://acme.dev" };

describe("target length", () => {
  it("uses the default 90–120s window when no target is set", () => {
    expect(lengthWindow()).toEqual({ target: 105, min: 92, max: 118 });
    expect(acceptableRange()).toEqual({ min: 88, max: 125 });
  });

  it("scales the window and the demo budget with the target", () => {
    expect(lengthWindow(30)).toMatchObject({ min: 24, max: 36 });
    expect(lengthWindow(180)).toMatchObject({ min: 153, max: 207 });
    expect(lengthBudget(30).demoSteps).toBe(3);
    expect(lengthBudget(180).demoSteps).toBe(12);
    expect(formatSeconds(45)).toBe("45s");
    expect(formatSeconds(150)).toBe("2:30");
  });

  it("validates the form value: 30s to 3 min, snapped to 15s, empty = default", () => {
    expect(JobFormSchema.parse({ ...form, length_s: "120" }).length_s).toBe(120);
    expect(JobFormSchema.parse({ ...form, length_s: 100 }).length_s).toBe(105);
    expect(JobFormSchema.parse({ ...form, length_s: "" }).length_s).toBeUndefined();
    expect(JobFormSchema.parse(form).length_s).toBeUndefined();
    expect(JobFormSchema.safeParse({ ...form, length_s: 0 }).success).toBe(false);
    expect(JobFormSchema.safeParse({ ...form, length_s: 240 }).success).toBe(false);
    expect(JobFormSchema.safeParse({ ...form, length_s: "abc" }).success).toBe(false);
  });

  it("tells the agent the window and budget", () => {
    const line = lengthLine(180);
    expect(line).toContain("about 3:00");
    expect(line).toContain("153–207s");
    expect(line).toContain("about 12 steps");
    expect(lengthLine(30)).toContain("no next section");
  });

  it("paces toward the team's window", () => {
    const scenes = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, section: "demo", narration: "word ".repeat(22) }));
    const short = choosePace(scenes, lengthWindow(60));
    const long = choosePace(scenes, lengthWindow(120));
    expect(short.base).toBeGreaterThan(long.base);
  });
});

function plan(words: number, target?: number): VideoPlan {
  const say = "Here the board shows the card move into the done column. ".repeat(4).split(" ").slice(0, words).join(" ");
  return {
    version: 1, seed: 1, style_kit: "midnight", brand: { primary: "#6366f1" }, size: { width: 1280, height: 720 }, fps: 30, credit: true, sources: [], target_s: target,
    scenes: Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, section: "demo", layout: "full-frame", duration_s: 5, narration: say, elements: [{ type: "clip", step_id: `s${i}`, zoom: "target" }], transition_in: "fade" })),
    flow: { project_name: "Acme", url: "https://acme.dev", viewport: { width: 1280, height: 720 }, steps: [{ id: "s1", action: "goto", url: "https://acme.dev", hold_ms: 3000, say: "x" }] },
  } as VideoPlan;
}

describe("pitch check length", () => {
  it("judges length against the team's target", () => {
    const p = plan(24); // 12 scenes × (8s + 1s) ≈ 108s: inside the default 90–120s
    expect(checkPitch(p, "Acme").checks.find((c) => c.id === "length")?.ok).toBe(true);
    const withTarget = checkPitch({ ...p, target_s: 60 }, "Acme").checks.find((c) => c.id === "length");
    expect(withTarget?.ok).toBe(false);
    expect(withTarget?.label).toBe("Fits about 1:00");
  });
});

describe("team choices", () => {
  it("sets the target and turns every clip into an inspect close-up", () => {
    const p = plan(10);
    applyTeamChoices(p, { lengthS: 150, closeups: true });
    expect(p.target_s).toBe(150);
    expect(p.scenes.every((s) => s.elements.every((e) => e.type === "clip" && e.zoom === "inspect"))).toBe(true);
  });

  it("leaves the agent's zooms alone without close-ups", () => {
    const p = plan(10);
    applyTeamChoices(p, {});
    expect(p.target_s).toBeUndefined();
    expect(p.scenes[0].elements[0]).toMatchObject({ zoom: "target" });
  });
});

describe("inspect close-up", () => {
  const inside = (l: { left: number; top: number; w: number; h: number }) =>
    l.left >= 0 && l.top >= 0 && l.left + l.w <= 1280 && l.top + l.h <= 720;
  const clear = (l: { left: number; top: number; w: number; h: number }, p: { x: number; y: number; w: number; h: number }) =>
    l.left >= p.x + p.w || l.left + l.w <= p.x || l.top >= p.y + p.h || l.top + l.h <= p.y;

  it("magnifies a small panel beside it, on screen and without covering it", () => {
    for (const box of [{ x: 900, y: 100, w: 40, h: 40 }, { x: 509, y: 664, w: 48, h: 48 }, { x: 20, y: 300, w: 120, h: 60 }]) {
      const p = panelBox(box);
      const l = loupeLayout(p);
      expect(l).not.toBeNull();
      expect(l!.mag).toBeGreaterThanOrEqual(1.35);
      expect(inside(l!)).toBe(true);
      expect(clear(l!, p)).toBe(true);
    }
  });

  it("skips the close-up when the panel already fills the screen", () => {
    expect(loupeLayout({ x: 0, y: 0, w: 900, h: 600 })).toBeNull();
  });
});

describe("panel area", () => {
  it("grows a small button to a readable area and keeps it on screen", () => {
    const p = panelBox({ x: 1124, y: 84, w: 40, h: 40 });
    expect(p.w).toBe(250);
    expect(p.h).toBe(96);
    expect(p.x + p.w).toBeLessThanOrEqual(1280);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });
});
