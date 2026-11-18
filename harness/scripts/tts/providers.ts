import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { ffmpeg } from "../ff";

export type ProviderName = "openai" | "elevenlabs" | "piper" | "none";

export type TtsConfig = {
  provider: ProviderName;
  apiKey?: string;
  voice?: string;
  fetchImpl?: typeof fetch;
};

/** Narration speed estimate used for silence and for planning hold times. */
export const WORDS_PER_SECOND = 2.5;

export const estimateSeconds = (text: string) =>
  Math.max(1, text.trim().split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND);

async function writeResponse(res: Response, outFile: string) {
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error("TTS returned an empty file");
  await fs.writeFile(outFile, buf);
}

export async function openaiTts(text: string, outFile: string, cfg: TtsConfig) {
  const res = await (cfg.fetchImpl ?? fetch)("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: cfg.voice || "alloy",
      input: text,
      response_format: "mp3",
      instructions: "Upbeat, clear product-demo narrator. Natural pace.",
    }),
  });
  await writeResponse(res, outFile);
}

export async function elevenlabsTts(text: string, outFile: string, cfg: TtsConfig) {
  // Default: "Brian", a premade voice (library voices like Rachel need a paid plan via the API).
  const voice = cfg.voice || "nPczCjzI2devNBz1zQrb";
  const res = await (cfg.fetchImpl ?? fetch)(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": cfg.apiKey ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    },
  );
  await writeResponse(res, outFile);
}

export async function piperTts(text: string, outFile: string, cfg: TtsConfig) {
  const model = cfg.voice || process.env.PIPER_MODEL;
  if (!model) throw new Error("piper needs PIPER_MODEL or TTS_VOICE (path to .onnx voice)");
  const wav = outFile.replace(/\.mp3$/, ".wav");
  await new Promise<void>((resolve, reject) => {
    const p = spawn("piper", ["--model", model, "--output_file", wav]);
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`piper exited ${c}`))));
    p.stdin.end(text);
  });
  await ffmpeg(["-i", wav, "-ar", "44100", "-ac", "1", "-b:a", "128k", outFile]);
  await fs.rm(wav, { force: true });
}

export async function silence(text: string, outFile: string) {
  const secs = estimateSeconds(text).toFixed(2);
  await ffmpeg([
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", secs, "-b:a", "64k", outFile,
  ]);
}

export async function synthesize(text: string, outFile: string, cfg: TtsConfig) {
  switch (cfg.provider) {
    case "openai":
      return openaiTts(text, outFile, cfg);
    case "elevenlabs":
      return elevenlabsTts(text, outFile, cfg);
    case "piper":
      return piperTts(text, outFile, cfg);
    default:
      return silence(text, outFile);
  }
}
