import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { renderVideo, getBundle } from "../harness/scripts/render_video";
import { probeDuration, probeStreams } from "../harness/scripts/ff";
import { ContractSchema } from "../harness/schemas/contract";
import { tmpDir } from "./helpers";

const fixture = path.resolve(__dirname, "fixtures/plans/basic.json");

beforeAll(async () => {
  await ensureBrowser(); // one-time Chrome Headless Shell download, not part of render time
  await getBundle();
}, 600_000);

describe("renderVideo (Remotion)", () => {
  it("renders a plan to 1280x720 H.264/AAC with the planned duration, under 60s", async () => {
    const out = tmpDir("pc-remotion-");
    fs.copyFileSync(fixture, path.join(out, "video_plan.json"));
    const t0 = Date.now();
    const contract = await renderVideo(out);
    const secs = (Date.now() - t0) / 1000;
    const streams = await probeStreams(path.join(out, "demo.mp4"));
    const v = streams.find((s) => s.codec_type === "video")!;
    const a = streams.find((s) => s.codec_type === "audio")!;
    expect([v.codec_name, v.width, v.height]).toEqual(["h264", 1920, 1080]);
    expect(a.codec_name).toBe("aac");
    const dur = await probeDuration(path.join(out, "demo.mp4"));
    expect(Math.abs(dur - 13)).toBeLessThanOrEqual(0.2); // 3+3+3+2+2
    expect(secs).toBeLessThan(60);
    expect(ContractSchema.safeParse(contract).success).toBe(true);
    expect(contract).toMatchObject({ render_mode: "remotion", seed: 7, style_kit: "blueprint" }); // "default" resolves by seed: 7 % 8 = 7 → blueprint
    expect(fs.statSync(path.join(out, "thumb.jpg")).size).toBeGreaterThan(1000);
  }, 300_000);

  it("rejects an invalid plan", async () => {
    const out = tmpDir("pc-remotion-bad-");
    const bad = JSON.parse(fs.readFileSync(fixture, "utf8"));
    bad.scenes[0].section = "intro";
    fs.writeFileSync(path.join(out, "video_plan.json"), JSON.stringify(bad));
    await expect(renderVideo(out)).rejects.toThrow();
  });
});
