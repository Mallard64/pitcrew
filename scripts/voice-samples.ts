/**
 * Writes public/voices/<key>.mp3: one short line per narrator, for the form's ▶ preview.
 *   npx tsx --env-file=.env scripts/voice-samples.ts
 */
import fs from "node:fs";
import { elevenlabsTts } from "../harness/scripts/tts/providers";
import { trimSilence } from "../harness/scripts/tts";
import { VOICES, VOICE_KEYS } from "../src/lib/voices";

const LINE = "Every team ships a demo video tonight. This is what yours could sound like.";

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  fs.mkdirSync("public/voices", { recursive: true });
  for (const k of VOICE_KEYS) {
    const out = `public/voices/${k}.mp3`;
    await elevenlabsTts(LINE, out, { provider: "elevenlabs", apiKey, voice: VOICES[k].elevenlabs });
    await trimSilence(out);
    console.log(k, fs.statSync(out).size, "bytes");
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
