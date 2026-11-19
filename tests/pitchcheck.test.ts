import { describe, expect, it } from "vitest";
import { checkPitch, mergeJudgeRewrite } from "../src/lib/pitchcheck";
import { chooseTransition } from "../remotion/transitions";
import { describeToolCall } from "../src/lib/harness/real";
import { resolveVoice } from "../src/lib/voices";
import type { VideoPlan } from "../harness/schemas/video_plan";

const scene = (id: string, section: VideoPlan["scenes"][number]["section"], narration: string, elements: VideoPlan["scenes"][number]["elements"] = []) =>
  ({ id, section, layout: "big-statement", duration_s: 5, narration, elements, transition_in: "fade" }) as VideoPlan["scenes"][number];

function plan(scenes: VideoPlan["scenes"]): VideoPlan {
  return {
    version: 1, seed: 1, style_kit: "midnight", brand: { primary: "#6366f1" }, size: { width: 1280, height: 720 }, fps: 30, credit: true, scenes, sources: [],
    flow: { project_name: "Acme", url: "https://acme.dev", viewport: { width: 1280, height: 720 }, steps: [{ id: "s1", action: "goto", url: "https://acme.dev", hold_ms: 3000, say: "x" }] },
  };
}

const demo = (n: number) => Array.from({ length: n }, (_, i) => scene(`d${i}`, "demo", `Here you drag a card into the done column and it saves on its own number ${i}.`, [{ type: "clip", step_id: `s${i}`, zoom: "target" }]));
const filler = "Every sprint review starts with ten minutes of hunting through tabs for the latest status before anyone can talk about the work itself.";

describe("checkPitch", () => {
  it("passes a judge-friendly script", () => {
    const p = plan([
      scene("problem", "problem", `Your standup ends and nobody knows what shipped. ${filler} ${filler}`),
      scene("solution", "solution", `Acme turns your commits into a status board that updates itself. ${filler}`),
      ...demo(5),
      scene("next", "next", "Next we add Slack digests and a weekly summary for managers."),
      scene("end", "end", ""),
    ]);
    const r = checkPitch(p, "Acme", 75); // a 75 s target: this script is sized for it
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
    expect(r.score).toBe(r.total);
  });

  it("flags a product-name opener, hype and a short demo", () => {
    const p = plan([
      scene("problem", "problem", "Acme is a revolutionary, seamless platform for teams."),
      scene("solution", "solution", "It helps you work."),
      ...demo(2),
      scene("end", "end", ""),
    ]);
    const failed = checkPitch(p, "Acme").checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(["hook", "named", "demo", "plain", "length"]));
  });
});

describe("mergeJudgeRewrite", () => {
  it("takes only words; keeps clips, flow and long demo lines out", () => {
    const original = plan([scene("problem", "problem", "Old line.", [{ type: "kinetic_headline", text: "Old", animation: "word-by-word" }]), ...demo(1)]);
    const rewritten = structuredClone(original);
    rewritten.scenes[0].narration = "New hook line.";
    rewritten.scenes[0].elements = [{ type: "kinetic_headline", text: "New", animation: "word-by-word" }];
    rewritten.scenes[1].narration = "word ".repeat(30);
    rewritten.scenes[1].elements = [{ type: "clip", step_id: "other", zoom: "none" }];
    rewritten.flow.url = "https://evil.example";
    const merged = mergeJudgeRewrite(original, rewritten);
    expect(merged.scenes[0].narration).toBe("New hook line.");
    expect(merged.scenes[0].elements[0]).toMatchObject({ text: "New" });
    expect(merged.scenes[1].narration).toBe(original.scenes[1].narration);
    expect(merged.scenes[1].elements[0]).toMatchObject({ step_id: "s0" });
    expect(merged.flow.url).toBe("https://acme.dev");
  });
});

describe("chooseTransition", () => {
  it("marks story beats and keeps demo steps moving", () => {
    expect(chooseTransition("slide", "problem", "solution", 0)).toBe("zoom");
    expect(chooseTransition("wipe", "solution", "demo", 1)).toBe("push");
    expect(chooseTransition("fade", "next", "end", 8)).toBe("iris");
    expect(chooseTransition("whip", "problem", "solution", 0)).toBe("whip");
    expect(chooseTransition("fade", "demo", "demo", 3)).toBe("whip");
    expect(chooseTransition("wipe", "demo", "demo", 3)).toBe("wipe");
    expect(chooseTransition("bogus", "demo", "demo", 2)).toBe("slide");
  });
});

describe("public log lines", () => {
  it("never include memory or response ids", () => {
    expect(describeToolCall("mcp__memories__memory_recall", JSON.stringify({ memory: "hmem_5a8e05d7", query: "x" }))).toBe("Agent checked its notes from earlier videos");
    expect(describeToolCall("browser_navigate", JSON.stringify({ url: "https://jsoncrack.com" }))).toBe("Agent opened https://jsoncrack.com");
    expect(describeToolCall("weird_tool", "{not json")).toBe("Agent used weird tool");
  });
});

describe("resolveVoice", () => {
  it("uses the team's pick, else a voice that suits the look", () => {
    expect(resolveVoice("george", "terminal")).toBe("george");
    expect(resolveVoice(undefined, "paper")).toBe("george");
    expect(resolveVoice("nope", "unknown")).toBe("brian");
  });
});
