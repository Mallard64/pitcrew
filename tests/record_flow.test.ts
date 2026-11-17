import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { recordFlow } from "../harness/scripts/record_flow";
import { probeDuration } from "../harness/scripts/ff";
import { serveDir, tmpDir } from "./helpers";

let site: { url: string; close: () => Promise<void> };
beforeAll(async () => {
  site = await serveDir(path.resolve(__dirname, "fixtures/site"));
});
afterAll(() => site.close());

const flow = (steps: unknown[]) => ({
  project_name: "Fixture",
  url: site.url,
  viewport: { width: 1280, height: 720 },
  steps,
});

describe("recordFlow", () => {
  it("records a 5-step flow with screenshots and timings", async () => {
    const out = tmpDir();
    const steps = [
      { id: "s1", action: "goto", url: `${site.url}/index.html`, hold_ms: 1500, say: "Home." },
      { id: "s2", action: "click", selector: "#go", hold_ms: 1500, say: "Click." },
      { id: "s3", action: "scroll", y: 500, hold_ms: 1500, say: "Scroll." },
      { id: "s4", action: "goto", url: `${site.url}/form.html`, hold_ms: 1500, say: "Form." },
      { id: "s5", action: "type", selector: "input[name=q]", text: "demo", hold_ms: 1500, say: "Type." },
    ];
    const res = await recordFlow(flow(steps), out);
    expect(res.stepsOk).toBe(5);
    for (const s of steps) expect(fs.existsSync(path.join(out, "shots", `${s.id}.png`))).toBe(true);
    const timings = JSON.parse(fs.readFileSync(path.join(out, "timings.json"), "utf8"));
    expect(timings).toHaveLength(5);
    for (let i = 1; i < timings.length; i++)
      expect(timings[i].start_ms).toBeGreaterThanOrEqual(timings[i - 1].end_ms);
    const dur = await probeDuration(res.videoPath);
    // Hold times sum to 7.5s; actions (typing, navigation) add a little on top.
    expect(dur).toBeGreaterThan(7.5 - 1.5);
    expect(dur).toBeLessThan(timings[4].end_ms / 1000 + 1.5);
  });

  it("marks a bad selector as failed and keeps going", async () => {
    const out = tmpDir();
    const res = await recordFlow(
      flow([
        { id: "s1", action: "goto", url: `${site.url}/index.html`, hold_ms: 1000, say: "Home." },
        { id: "s2", action: "click", selector: "#does-not-exist", hold_ms: 1000, say: "Nope." },
        { id: "s3", action: "scroll", y: 300, hold_ms: 1000, say: "Scroll." },
      ]),
      out,
      { stepTimeoutMs: 1500 },
    );
    expect(res.stepsOk).toBe(2);
    expect(res.timings[1].ok).toBe(false);
    expect(res.timings[1].error).toBeTruthy();
  });
});
