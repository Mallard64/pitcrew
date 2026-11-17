import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assembleVideo, captionChunks, toSrt } from "../harness/scripts/assemble";
import { renderSlideshow } from "../harness/scripts/slideshow";
import { ffmpeg, probeDuration, probeStreams } from "../harness/scripts/ff";
import { ContractSchema } from "../harness/schemas/contract";
import { tmpDir } from "./helpers";

const steps = ["s1", "s2", "s3"];

async function synthInputs(withRecording: boolean) {
  const out = tmpDir("pc-asm-");
  fs.mkdirSync(path.join(out, "audio"));
  fs.mkdirSync(path.join(out, "shots"));
  if (withRecording)
    await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=1280x720:rate=25:duration=9", "-c:v", "libvpx", "-b:v", "1M", path.join(out, "recording.webm")]);
  const timings = steps.map((id, i) => ({ step_id: id, ok: true, start_ms: i * 3000, end_ms: (i + 1) * 3000 }));
  const durations = [];
  for (const [i, id] of steps.entries()) {
    const d = [2, 4, 1.5][i]; // s2 narration overruns its 3s window
    await ffmpeg(["-f", "lavfi", "-i", `sine=frequency=${300 + i * 100}:duration=${d}`, "-b:a", "64k", path.join(out, "audio", `${id}.mp3`)]);
    durations.push({ step_id: id, duration_s: await probeDuration(path.join(out, "audio", `${id}.mp3`)) });
    await ffmpeg(["-f", "lavfi", "-i", `testsrc=size=1280x720`, "-frames:v", "1", path.join(out, "shots", `${id}.png`)]);
  }
  fs.writeFileSync(path.join(out, "timings.json"), JSON.stringify(timings));
  fs.writeFileSync(path.join(out, "audio/durations.json"), JSON.stringify(durations));
  fs.writeFileSync(
    path.join(out, "script.json"),
    JSON.stringify({ segments: steps.map((id) => ({ step_id: id, text: `This is step ${id}, showing a feature of the product.` })) }),
  );
  return { out, durations };
}

async function checkOutputs(out: string) {
  const demo = path.join(out, "demo.mp4");
  const streams = await probeStreams(demo);
  const v = streams.find((s) => s.codec_type === "video")!;
  const a = streams.find((s) => s.codec_type === "audio")!;
  expect(v.codec_name).toBe("h264");
  expect([v.width, v.height]).toEqual([1280, 720]);
  expect(a.codec_name).toBe("aac");
  const srt = fs.readFileSync(path.join(out, "captions.srt"), "utf8");
  expect(srt).toMatch(/^1\n\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}\n/);
  expect(fs.statSync(path.join(out, "thumb.jpg")).size).toBeGreaterThan(1000);
  return probeDuration(demo);
}

describe("captions", () => {
  it("chunks text and keeps timing contiguous", () => {
    const c = captionChunks("one two three four five six seven eight nine ten eleven twelve", 0.3, 6);
    expect(c.length).toBe(2);
    expect(c[0].start).toBeCloseTo(0.3);
    expect(c[1].end).toBeCloseTo(6.3);
    expect(toSrt(c)).toContain("00:00:00,300 --> ");
  });
});

describe("assembleVideo", () => {
  it("recording mode: cards + 3 steps, narration never cut", async () => {
    const { out } = await synthInputs(true);
    const contract = await assembleVideo({ outDir: out, title: "Fixture", url: "https://example.com" });
    expect(ContractSchema.safeParse(contract).success).toBe(true);
    expect(contract.render_mode).toBe("recording");
    expect(contract.steps_ok).toBe(3);
    const dur = await checkOutputs(out);
    // 2.5s title + 3s + (4+0.7)s held + 3s + 2.5s end ≈ 15.7s
    expect(dur).toBeGreaterThan(14.5);
    expect(dur).toBeLessThan(17);
    expect(contract.status).toBe("partial"); // short synthetic video is outside 45-90s
  });

  it("slideshow mode from stills", async () => {
    const { out, durations } = await synthInputs(false);
    const contract = await renderSlideshow(out, "Fixture", "https://example.com");
    expect(contract.render_mode).toBe("slideshow");
    const dur = await checkOutputs(out);
    const expected = 5 + durations.reduce((s, d) => s + d.duration_s + 1.2, 0);
    expect(Math.abs(dur - expected)).toBeLessThan(1.5);
  });
});
