import { describe, expect, it } from "vitest";
import { mergeRepairedSteps, repairableFailures, repairPrompt } from "../src/lib/repair";
import type { Flow } from "../harness/schemas/flow";

const flow: Flow = {
  project_name: "Squoosh",
  url: "https://squoosh.app",
  viewport: { width: 1280, height: 720 },
  steps: [
    { id: "s1", action: "goto", url: "https://squoosh.app", hold_ms: 3000, say: "Squoosh opens on a drop zone." },
    { id: "s2", action: "click", selector: "text=Large photo", hold_ms: 4000, say: "Pick the sample photo." },
    { id: "s3", action: "type", selector: "input[type=number]", text: "20", hold_ms: 4000, say: "Set quality to 20." },
    { id: "s4", action: "goto", url: "https://squoosh.app/about", hold_ms: 3000, say: "About page." },
  ],
};
const timings = [
  { step_id: "s1", ok: true, start_ms: 0, end_ms: 3000 },
  { step_id: "s2", ok: false, start_ms: 3000, end_ms: 9000, error: "locator.waitFor: Timeout", candidates: ['img[alt="Large photo"]', 'text="Paste"'] },
  { step_id: "s3", ok: false, start_ms: 9000, end_ms: 15000, error: "locator.waitFor: Timeout" },
  { step_id: "s4", ok: false, start_ms: 15000, end_ms: 20000, error: "net::ERR" },
];

describe("demo repair", () => {
  it("repairs failed clicks and types, not failed page loads", () => {
    const f = repairableFailures(flow, timings);
    expect(f.map((x) => x.step.id)).toEqual(["s2", "s3"]);
    const prompt = repairPrompt(f);
    expect(prompt).toContain('img[alt="Large photo"]');
    expect(prompt).toContain("(none found)");
  });

  it("takes only the failed steps' new selectors and keeps their narration", () => {
    const repaired: Flow = {
      ...flow,
      steps: [
        { ...flow.steps[0], url: "https://evil.example" }, // not a failed step: ignored
        { ...flow.steps[1], selector: 'img[alt="Large photo"]', say: "Something else entirely." },
        { ...flow.steps[2] }, // unchanged
      ],
    };
    const { flow: out, changed } = mergeRepairedSteps(flow, repaired, ["s2", "s3"]);
    expect(changed).toBe(1);
    expect(out.steps[0].url).toBe("https://squoosh.app");
    expect(out.steps[1].selector).toBe('img[alt="Large photo"]');
    expect(out.steps[1].say).toBe("Pick the sample photo.");
    expect(out.steps[2]).toEqual(flow.steps[2]);
  });

  it("ignores an invalid repaired step", () => {
    const repaired: Flow = { ...flow, steps: [{ ...flow.steps[1], selector: undefined }] };
    expect(mergeRepairedSteps(flow, repaired, ["s2"]).changed).toBe(0);
  });
});
