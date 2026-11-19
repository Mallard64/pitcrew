import { describe, expect, it } from "vitest";
import { checkSensitive, detectTopic, DISCLAIMER, scrubSensitive } from "../src/lib/sensitive";
import { detectKind, readmeImages } from "../src/lib/repo";
import { chooseSegments } from "../harness/scripts/footage";
import { chooseDemoMode } from "../src/lib/pipeline";
import { showcasePlan } from "../src/lib/planner/showcase";
import { diagramLayers } from "../remotion/Scene";
import { JobFormSchema } from "../src/lib/validate";
import { VideoPlanSchema, type VideoPlan } from "../harness/schemas/video_plan";
import type { RepoFacts } from "../src/lib/repo";

const scene = (id: string, section: VideoPlan["scenes"][number]["section"], narration: string, elements: VideoPlan["scenes"][number]["elements"] = []) =>
  ({ id, section, layout: "big-statement", duration_s: 5, narration, elements, transition_in: "fade" }) as VideoPlan["scenes"][number];
const plan = (scenes: VideoPlan["scenes"]): VideoPlan => ({
  version: 1, seed: 1, style_kit: "clean", brand: { primary: "#6366f1" }, size: { width: 1920, height: 1080 }, fps: 30, credit: true, sources: [], scenes,
  flow: { project_name: "Calm", url: "https://github.com/a/calm", viewport: { width: 1280, height: 720 }, steps: [{ id: "s1", action: "goto", url: "https://github.com/a/calm", hold_ms: 3000, say: "" }] },
});

describe("sensitive topics", () => {
  it("detects a mental-health chatbot and leaves a chemistry app alone", () => {
    expect(detectTopic("An AI chatbot that offers emotional support for students with anxiety")).toBe("mental-health");
    expect(detectTopic("A gamified AP Chemistry web app with lessons and streaks")).toBeNull();
    expect(DISCLAIMER["mental-health"]).toBe("Not a substitute for professional care");
  });

  it("rejects treatment, replacement and outcome claims, and scrubs them", () => {
    const p = plan([
      scene("problem", "problem", "Students wait weeks to see a counselor."),
      scene("solution", "solution", "Calm is a chat companion you can talk to at 2 a.m. It treats anxiety in minutes. It replaces your therapist."),
      scene("evidence", "evidence", "It reduces stress for every student.", [{ type: "bullets", items: ["Talk any time", "Better than a therapist"], animation: "slide-up" }]),
    ]);
    const v = checkSensitive(p, "mental-health");
    expect(v.map((x) => x.text)).toEqual(
      expect.arrayContaining(["It treats anxiety in minutes.", "It replaces your therapist.", "It reduces stress for every student.", "Better than a therapist"]),
    );
    expect(v.some((x) => x.text.startsWith("Calm is a chat companion"))).toBe(false);
    const removed = scrubSensitive(p, "mental-health");
    expect(removed).toBeGreaterThanOrEqual(4);
    expect(checkSensitive(p, "mental-health")).toEqual([]);
    expect(p.scenes[1].narration).toBe("Calm is a chat companion you can talk to at 2 a.m.");
  });

  it("allows an outcome claim when the team cited a source", () => {
    const p = plan([scene("evidence", "evidence", "In our pilot it reduced stress scores for 30 students.")]);
    p.sources = [{ id: "t1", stat: "30", claim_text: "", source_name: "Team pilot", url: "https://example.org", year: 2026, quote: "", verified: false, kind: "team-provided" }];
    expect(checkSensitive(p, "mental-health")).toEqual([]);
  });
});

describe("GitHub-only projects", () => {
  it("detects the stack and kind from files, never by running code", () => {
    expect(detectKind(["ProjectSettings/ProjectVersion.txt", "Assets/Scripts/Player.cs"], { "ProjectSettings/ProjectVersion.txt": "m_EditorVersion: 2022.3.32f1" })).toEqual({ kind: "game-unity", stack: ["Unity 2022.3.32f1", "C#"] });
    expect(detectKind(["package.json"], { "package.json": JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "14", react: "18" } }) }).kind).toBe("web");
    expect(detectKind(["backend/requirements.txt", "demo/App.swift"], { "backend/requirements.txt": "fastapi\nsqlalchemy" }).kind).toBe("python-web");
    expect(detectKind(["project.godot"], {}).kind).toBe("game-godot");
  });

  it("finds README images that exist in the repo", () => {
    const md = "| ![Lesson player](docs/screenshots/lesson.png) |\n![remote](https://x.io/a.png)\n<img src=\"./docs/b.gif\">";
    expect(readmeImages(md, "README.md", ["docs/screenshots/lesson.png", "docs/b.gif"])).toEqual([
      { path: "docs/screenshots/lesson.png", alt: "Lesson player" },
      { path: "docs/b.gif", alt: "" },
    ]);
  });

  it("chooses the demo mode: footage, then live, then sandbox for web repos, else showcase", () => {
    expect(chooseDemoMode({ footage: true, liveUrl: "https://a.dev", kind: "web" })).toBe("footage");
    expect(chooseDemoMode({ footage: false, liveUrl: "https://a.dev" })).toBe("live");
    expect(chooseDemoMode({ footage: false, kind: "web" })).toBe("sandbox-run");
    expect(chooseDemoMode({ footage: false, kind: "game-unity" })).toBe("repo-showcase");
    expect(chooseDemoMode({ footage: false, kind: "ios" })).toBe("repo-showcase");
  });

  it("accepts a repo without a live link, and neither is rejected", () => {
    expect(JobFormSchema.parse({ project_name: "X", repo_url: "https://github.com/a/b" }).live_url).toBe("");
    expect(JobFormSchema.safeParse({ project_name: "X" }).success).toBe(false);
    expect(JobFormSchema.safeParse({ project_name: "X", live_url: "not a url at all" }).success).toBe(false);
  });

  it("builds a valid offline showcase plan with the outline and no invented evidence", () => {
    const repo = { url: "https://github.com/a/wumpus", stack: ["Unity", "C#"], stars: 0, contributors: 2, releases: [], openIssues: [], readme: { path: "README.md", text: "" }, description: "", kind: "game-unity", fetchedAt: "2026-11-18" } as unknown as RepoFacts;
    const p = showcasePlan({ projectName: "Wumpus", liveUrl: "", repoUrl: repo.url, repo, footageClips: [{ id: "f1", duration_s: 8 }], blurb: "A cave game with trivia duels." });
    expect(VideoPlanSchema.safeParse(p).success).toBe(true);
    expect(p.demo_mode).toBe("footage");
    expect(p.scenes.map((s) => s.section)).toEqual(["solution", "demo", "built", "evidence", "ask", "end"]);
    expect(JSON.stringify(p.scenes.find((s) => s.section === "evidence"))).toContain("Source: github.com/a/wumpus, 2026-11-18");
    expect(p.scenes.find((s) => s.section === "ask")?.narration).toBe("Try it at github.com/a/wumpus.");
  });
});

describe("footage", () => {
  it("drops still stretches and splits at scene changes, best parts first up to the budget", () => {
    const segs = chooseSegments(40, [5, 12, 13, 30], [{ from: 18, to: 26 }], 20);
    expect(segs.every((s) => s.to - s.from <= 10 && s.to - s.from >= 1.5)).toBe(true);
    expect(segs.some((s) => s.from < 26 && s.to > 18)).toBe(false);
    expect(segs.reduce((n, s) => n + s.to - s.from, 0)).toBeLessThanOrEqual(30);
    expect(chooseSegments(10.4, [], [], 60)).toEqual([{ from: 0, to: 8, cuts: 0 }, { from: 8, to: 10.4, cuts: 0 }]);
  });
});

describe("architecture diagram", () => {
  it("puts nodes in dependency columns", () => {
    expect(diagramLayers({ nodes: [{ id: "ui", label: "UI" }, { id: "api", label: "API" }, { id: "db", label: "DB" }], edges: [{ from: "ui", to: "api" }, { from: "api", to: "db" }] })).toEqual([["ui"], ["api"], ["db"]]);
    expect(diagramLayers({ nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] }).flat().sort()).toEqual(["a", "b"]);
  });
});
