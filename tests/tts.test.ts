import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { voiceScript, ttsConfigFromEnv } from "../harness/scripts/tts";
import { tmpDir } from "./helpers";

const tone = fs.readFileSync(path.resolve(__dirname, "fixtures/audio/tone.mp3"));
const script = {
  segments: [
    { step_id: "s1", text: "Meet the fixture app, a tiny demo." },
    { step_id: "s2", text: "Click get started." },
  ],
};

describe("voiceScript", () => {
  it.each(["openai", "elevenlabs"] as const)("%s: writes provider audio + ffprobe durations", async (provider) => {
    const fetchImpl = vi.fn(async () => new Response(tone, { status: 200 }));
    const out = tmpDir();
    const res = await voiceScript(script, out, { provider, apiKey: "k", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.map((r) => r.step_id)).toEqual(["s1", "s2"]);
    for (const r of res) {
      expect(r.duration_s).toBeGreaterThan(1.0);
      expect(r.duration_s).toBeLessThan(1.5);
      expect(r.fallback).toBeUndefined();
      expect(fs.existsSync(path.join(out, "audio", `${r.step_id}.mp3`))).toBe(true);
    }
    expect(JSON.parse(fs.readFileSync(path.join(out, "audio/durations.json"), "utf8"))).toEqual(res);
  });

  it("falls back to silence after retries and flags it", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const res = await voiceScript(script, tmpDir(), { provider: "openai", apiKey: "k", fetchImpl }, { backoffMs: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(6); // 2 segments x (1 + 2 retries)
    expect(res.every((r) => r.fallback)).toBe(true);
  });

  it("none: silence sized at words / 2.5", async () => {
    const res = await voiceScript(script, tmpDir(), { provider: "none" });
    expect(res[0].duration_s).toBeCloseTo(7 / 2.5, 0); // 7 words
    expect(res[1].duration_s).toBeCloseTo(1.2, 0); // 3 words
  });

  it("degrades to none when a paid provider has no key", () => {
    expect(ttsConfigFromEnv({ TTS_PROVIDER: "openai" }).provider).toBe("none");
    expect(ttsConfigFromEnv({ TTS_PROVIDER: "openai", TTS_API_KEY: "x" }).provider).toBe("openai");
  });
});
