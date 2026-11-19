import { describe, expect, it } from "vitest";
import { parseJudge, pickModels, runPitchRoom, type TaskFn } from "../src/lib/pitchroom";

const scenes = [
  { id: "problem", section: "problem", narration: "Demo videos take hours.", duration_s: 5 },
  { id: "s1", section: "demo", narration: "Paste a link and the agent records it.", duration_s: 6 },
];
const noWait = async () => {};
const draft = (p: string, d: string) => JSON.stringify({ scenes: [{ id: "problem", narration: p }, { id: "s1", narration: d }] });

describe("Pitch Room", () => {
  it("parses the judge's strict JSON (fenced) and rejects a winner that doesn't exist", () => {
    const reply = 'Scores:\n```json\n{"drafts":[{"draft":1,"scores":{"problem":7,"demo":9},"reason":"Clear.","total":8},{"draft":2,"scores":{"problem":5,"demo":6},"reason":"Vague.","total":5.5}],"winner":1}\n```';
    const j = parseJudge(reply, 2);
    expect(j.winner).toBe(1);
    expect(j.drafts[0].scores.demo).toBe(9);
    expect(() => parseJudge('{"drafts":[],"winner":3}', 2)).toThrow();
    expect(() => parseJudge('{"drafts":[{"draft":1,"scores":{"problem":11},"reason":"x"}],"winner":1}', 1)).toThrow();
  });

  it("returns null (normal flow) when every draft fails, without calling the judge", async () => {
    const calls: string[] = [];
    const task: TaskFn = async (input) => {
      calls.push(input.slice(0, 20));
      throw new Error("HarnessRouter HTTP 500");
    };
    const r = await runPitchRoom({ task, models: {}, scenes, notes: "{}", log: () => {}, wait: noWait });
    expect(r).toBeNull();
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.startsWith("PITCH ROOM TASK"))).toBe(true);
  });

  it("retries a 429 once, caps a draft with an unverified number at 5, and the best verified draft wins", async () => {
    let first429 = true;
    const task: TaskFn = async (input) => {
      if (input.startsWith("PITCH ROOM JUDGE"))
        return { text: '{"drafts":[{"draft":1,"scores":{"problem":9,"demo":9},"reason":"Vivid.","total":9},{"draft":2,"scores":{"problem":7,"demo":7},"reason":"Solid.","total":7},{"draft":3,"scores":{"problem":6,"demo":6},"reason":"Ok.","total":6}],"winner":1}', usage: { total_tokens: 100 } };
      if (input.includes("Your angle: customer story")) {
        if (first429) {
          first429 = false;
          throw new Error("HarnessRouter HTTP 429: too many requests");
        }
        return { text: draft("Ana loses 80% of her weekend to editing.", "She pastes her link."), usage: { total_tokens: 10 } };
      }
      return { text: draft("Demo videos take hours.", "Paste a link and watch it record."), usage: { total_tokens: 10 } };
    };
    const r = await runPitchRoom({ task, models: { draft: "cheap", judge: "strong" }, scenes, notes: "{}", log: () => {}, wait: noWait });
    expect(r).not.toBeNull();
    expect(r!.drafts[0].unverified).toEqual(["80"]);
    expect(r!.drafts[0].total).toBe(5);
    expect(r!.winner).toBe(1);
    expect(r!.usage.total_tokens).toBe(130);
  });

  it("picks the cheapest and strongest allowed models, with env overrides", () => {
    expect(pickModels(["claude-sonnet-5.5", "claude-haiku-4.5", "claude-opus-5.5"], {})).toEqual({ draft: "claude-haiku-4.5", judge: "claude-opus-5.5" });
    expect(pickModels([], { PITCH_ROOM_DRAFT_MODEL: "x" }).draft).toBe("x");
  });
});
