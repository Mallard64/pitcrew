/**
 * Narrator voices a team can pick. Premade ElevenLabs voices (all available on our plan, checked with
 * GET /v1/voices on 2026-11-18); `openai` is the matching voice when TTS_PROVIDER=openai.
 * "auto" picks by the video's look. Shared by the form (labels) and the pipeline (ids).
 */
export type VoiceKey = "brian" | "sarah" | "george" | "alice" | "matilda" | "liam" | "jessica" | "river" | "daniel" | "laura";

export const VOICES: Record<VoiceKey, { label: string; tone: string; elevenlabs: string; openai: string }> = {
  brian: { label: "Brian", tone: "Deep, calm, American", elevenlabs: "nPczCjzI2devNBz1zQrb", openai: "onyx" },
  sarah: { label: "Sarah", tone: "Confident, reassuring, American", elevenlabs: "EXAVITQu4vr4xnSDxMaL", openai: "nova" },
  george: { label: "George", tone: "Warm storyteller, British", elevenlabs: "JBFqnCBsd6RMkjVDRZzb", openai: "fable" },
  alice: { label: "Alice", tone: "Clear educator, British", elevenlabs: "Xb7hH8MSUJpSbSDYk0k2", openai: "sage" },
  matilda: { label: "Matilda", tone: "Upbeat, professional, American", elevenlabs: "XrExE9yKIg1WjnnlVkGX", openai: "coral" },
  liam: { label: "Liam", tone: "Energetic creator, American", elevenlabs: "TX3LPaxmHKxFdv7VOQHJ", openai: "echo" },
  jessica: { label: "Jessica", tone: "Bright, playful, American", elevenlabs: "cgSgspJ2msm6clMCkdW9", openai: "shimmer" },
  river: { label: "River", tone: "Relaxed, neutral, American", elevenlabs: "SAz9YHcvj6GT2YYXdXww", openai: "alloy" },
  daniel: { label: "Daniel", tone: "Steady broadcaster, British", elevenlabs: "onwK4e9ZLuTAKqWW03F9", openai: "ash" },
  laura: { label: "Laura", tone: "Enthusiastic, quirky, American", elevenlabs: "FGY2WhTYpPnrIDTdsKH5", openai: "ballad" },
};
export const VOICE_KEYS = Object.keys(VOICES) as VoiceKey[];

/** Default narrator per look when the team leaves the voice on "auto". */
const BY_KIT: Record<string, VoiceKey> = {
  midnight: "brian", paper: "george", terminal: "river", poster: "liam",
  aurora: "jessica", clean: "matilda", studio: "sarah", blueprint: "alice",
};

export function resolveVoice(choice: string | null | undefined, kit: string): VoiceKey {
  if (choice && (VOICE_KEYS as string[]).includes(choice)) return choice as VoiceKey;
  return BY_KIT[kit] ?? "brian";
}

/** Looks a team can force; "auto" lets the agent pick. Labels match the landing-page gallery. */
export const LOOKS = [
  ["midnight", "Midnight"], ["paper", "Paper"], ["terminal", "Terminal"], ["poster", "Poster"],
  ["aurora", "Aurora"], ["clean", "Clean"], ["studio", "Studio"], ["blueprint", "Blueprint"],
] as const;
export const LOOK_IDS = LOOKS.map(([id]) => id) as string[];
