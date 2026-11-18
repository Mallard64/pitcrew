/**
 * Voices each script segment into its own mp3 and measures the result.
 *
 * CLI: tsx harness/scripts/tts.ts <script.json> <out_dir>   (env: TTS_PROVIDER, TTS_API_KEY, TTS_VOICE)
 * Outputs: <out_dir>/audio/<step_id>.mp3, <out_dir>/audio/durations.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ScriptSchema } from "../schemas/script";
import { probeDuration } from "./ff";
import { silence, synthesize, type ProviderName, type TtsConfig } from "./tts/providers";

export type SegmentAudio = { step_id: string; duration_s: number; fallback?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ttsConfigFromEnv(env: Record<string, string | undefined> = process.env): TtsConfig {
  const p = (env.TTS_PROVIDER ?? "none").toLowerCase();
  const provider: ProviderName = ["openai", "elevenlabs", "piper"].includes(p)
    ? (p as ProviderName)
    : "none";
  // A paid provider without a key would fail on every segment; degrade up front.
  // OpenAI can reuse the account-wide OPENAI_API_KEY instead of a TTS-specific one.
  const apiKey = env.TTS_API_KEY || (provider === "openai" ? env.OPENAI_API_KEY : undefined);
  if ((provider === "openai" || provider === "elevenlabs") && !apiKey) return { provider: "none" };
  return { provider, apiKey, voice: env.TTS_VOICE || undefined };
}

export async function voiceScript(
  scriptInput: unknown,
  outDir: string,
  cfg: TtsConfig,
  opts: { retries?: number; backoffMs?: number; log?: (m: string) => void } = {},
): Promise<SegmentAudio[]> {
  const script = ScriptSchema.parse(scriptInput);
  const retries = opts.retries ?? 2;
  const log = opts.log ?? (() => {});
  const audioDir = path.join(outDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });

  const voiceOne = async (seg: { step_id: string; text: string }): Promise<SegmentAudio> => {
    const file = path.join(audioDir, `${seg.step_id}.mp3`);
    let fallback = false;
    if (!seg.text.trim()) {
      await silence("pause", file);
    } else {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await synthesize(seg.text, file, cfg);
          lastErr = undefined;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < retries) await sleep((opts.backoffMs ?? 800) * 2 ** attempt);
        }
      }
      if (lastErr) {
        log(`TTS failed for ${seg.step_id} (${(lastErr as Error).message}); using silence`);
        await silence(seg.text, file);
        fallback = cfg.provider !== "none";
      }
    }
    const duration_s = await probeDuration(file);
    return fallback ? { step_id: seg.step_id, duration_s, fallback } : { step_id: seg.step_id, duration_s };
  };

  // A few at a time: fast, without tripping provider rate limits.
  const results: SegmentAudio[] = new Array(script.segments.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, script.segments.length) }, async () => {
      while (next < script.segments.length) {
        const i = next++;
        results[i] = await voiceOne(script.segments[i]);
      }
    }),
  );
  await fs.writeFile(path.join(audioDir, "durations.json"), JSON.stringify(results, null, 2));
  return results;
}

async function main() {
  const [scriptPath, outDir] = process.argv.slice(2);
  if (!scriptPath || !outDir) {
    console.error("usage: tsx harness/scripts/tts.ts <script.json> <out_dir>");
    process.exit(1);
  }
  const script = JSON.parse(await fs.readFile(scriptPath, "utf8"));
  const res = await voiceScript(script, outDir, ttsConfigFromEnv(), { log: console.error });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
