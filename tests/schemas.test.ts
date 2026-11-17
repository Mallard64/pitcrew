import { describe, expect, it } from "vitest";
import { FlowSchema } from "../harness/schemas/flow";
import { ScriptSchema } from "../harness/schemas/script";
import { ContractSchema } from "../harness/schemas/contract";

const base = {
  project_name: "Demo",
  url: "https://example.com",
  viewport: { width: 1280, height: 720 },
};

describe("FlowSchema", () => {
  it("accepts a valid flow", () => {
    const r = FlowSchema.safeParse({
      ...base,
      steps: [
        { id: "s1", action: "goto", url: "https://example.com", hold_ms: 2500, say: "Meet Demo." },
        { id: "s2", action: "click", selector: "text=Go", hold_ms: 2000, say: "Click go." },
        { id: "s3", action: "type", selector: "input", text: "hi", hold_ms: 3000, say: "Type." },
        { id: "s4", action: "scroll", y: 600, hold_ms: 2000, say: "Scroll down." },
      ],
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ["no steps", []],
    ["hold too short", [{ id: "s1", action: "wait", hold_ms: 10, say: "x" }]],
    ["say too long", [{ id: "s1", action: "wait", hold_ms: 2000, say: "word ".repeat(26) }]],
    ["goto without url", [{ id: "s1", action: "goto", hold_ms: 2000, say: "x" }]],
    ["click without selector", [{ id: "s1", action: "click", hold_ms: 2000, say: "x" }]],
    ["bad action", [{ id: "s1", action: "hover", hold_ms: 2000, say: "x" }]],
  ])("rejects %s", (_name, steps) => {
    expect(FlowSchema.safeParse({ ...base, steps }).success).toBe(false);
  });

  it("rejects a non-720p viewport", () => {
    const r = FlowSchema.safeParse({
      ...base,
      viewport: { width: 1920, height: 1080 },
      steps: [{ id: "s1", action: "wait", hold_ms: 2000, say: "x" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("ScriptSchema / ContractSchema", () => {
  it("validates script segments", () => {
    expect(ScriptSchema.safeParse({ segments: [{ step_id: "s1", text: "hi" }] }).success).toBe(true);
    expect(ScriptSchema.safeParse({ segments: [{ text: "hi" }] }).success).toBe(false);
  });
  it("validates the contract", () => {
    const ok = {
      status: "ok",
      render_mode: "recording",
      duration_s: 61.2,
      steps_ok: 6,
      steps_total: 6,
      notes: "",
    };
    expect(ContractSchema.safeParse(ok).success).toBe(true);
    expect(ContractSchema.safeParse({ ...ok, status: "great" }).success).toBe(false);
  });
});
