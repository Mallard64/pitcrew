import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { recordFlow } from "../harness/scripts/record_flow";
import { planSegments, polishFootage } from "../harness/scripts/polish_footage";
import { probeStreams } from "../harness/scripts/ff";
import { serveDir, tmpDir } from "./helpers";

let site: { url: string; close: () => Promise<void> };
beforeAll(async () => {
  site = await serveDir(path.resolve(__dirname, "fixtures/site"));
});
afterAll(() => site.close());

const flow = (steps: unknown[]) => ({ project_name: "Fixture", url: site.url, viewport: { width: 1280, height: 720 }, steps });

describe("planSegments", () => {
  it("speeds up only a loading window longer than 1s", () => {
    const base = { step_id: "s1", ok: true, start_ms: 1000, end_ms: 7000 };
    expect(planSegments(base)).toEqual([{ from: 0, to: 6, factor: 1 }]);
    expect(planSegments({ ...base, wait: { start_ms: 1500, end_ms: 2200 } })).toHaveLength(1); // 0.7s: kept
    const segs = planSegments({ ...base, wait: { start_ms: 1500, end_ms: 4500 } });
    expect(segs).toEqual([
      { from: 0, to: 0.5, factor: 1 },
      { from: 0.5, to: 3.5, factor: 4 },
      { from: 3.5, to: 6, factor: 1 },
    ]);
  });
});

describe("polishFootage", () => {
  it("cuts a clip per step, speeds up the spinner, and records accurate zoom boxes", async () => {
    const out = tmpDir("pc-polish-");
    const res = await recordFlow(
      flow([
        { id: "s1", action: "goto", url: `${site.url}/spinner.html`, hold_ms: 1500, say: "It loads." },
        { id: "s2", action: "click", selector: "#cta", hold_ms: 1500, say: "Click.", zoom: "#cta" },
        { id: "s3", action: "goto", url: `${site.url}/form.html`, hold_ms: 1200, say: "Form." },
        { id: "s4", action: "type", selector: "input[name=q]", text: "demo", hold_ms: 1200, say: "Type." },
      ]),
      out,
    );
    expect(res.stepsOk).toBe(4);
    const [s1, s2, , s4] = res.timings;

    // Loading window seen in the DOM for ~3s.
    expect(s1.wait).toBeDefined();
    expect(s1.wait!.end_ms - s1.wait!.start_ms).toBeGreaterThan(2500);
    // Box of #cta: left 100, top 200, 200x60 (±4px).
    expect(Math.abs(s2.box!.x - 100)).toBeLessThanOrEqual(4);
    expect(Math.abs(s2.box!.y - 200)).toBeLessThanOrEqual(4);
    expect(Math.abs(s2.box!.w - 200)).toBeLessThanOrEqual(4);
    expect(Math.abs(s2.box!.h - 60)).toBeLessThanOrEqual(4);
    // Type step defaults its zoom target to the input, and the cursor path was recorded.
    expect(s4.box).toBeDefined();
    expect(s2.cursor!.length).toBeGreaterThanOrEqual(2);

    const clips = await polishFootage(out);
    expect(clips.map((c) => c.step_id)).toEqual(["s1", "s2", "s3", "s4"]);
    for (const c of clips) {
      expect(fs.existsSync(path.join(out, c.file))).toBe(true);
      const v = (await probeStreams(path.join(out, c.file))).find((s) => s.codec_type === "video")!;
      expect([v.codec_name, v.width, v.height]).toEqual(["h264", 2560, 1440]);
    }
    const c1 = clips[0];
    expect(c1.speedups).toHaveLength(1);
    expect(c1.raw_duration_s - c1.duration_s).toBeGreaterThanOrEqual(2); // 3s spinner at 4x saves ~2.25s
    expect(clips[1].speedups).toHaveLength(0);
    expect(Math.abs(clips[1].duration_s - clips[1].raw_duration_s)).toBeLessThan(0.3);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, "clips/manifest.json"), "utf8"));
    expect(manifest[1].box).toEqual(s2.box);
  });
});
