/** Pure caption timing shared by the Remotion renderer, the ffmpeg fallback and the .srt export. */
export type Chunk = { text: string; start: number; end: number };

const MAX_CAPTION_WORDS = 9;

/** Splits narration into short caption chunks, timed proportionally to word count. */
export function captionChunks(text: string, start: number, duration: number): Chunk[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    const breakHere = /[.!?;:,]$/.test(w) && cur.length >= 4;
    if (cur.length >= MAX_CAPTION_WORDS || breakHere) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) {
    // Avoid a dangling one- or two-word caption.
    if (cur.length <= 2 && groups.length) groups[groups.length - 1].push(...cur);
    else groups.push(cur);
  }
  const perWord = duration / words.length;
  const chunks: Chunk[] = [];
  let t = start;
  for (const g of groups) {
    const d = g.length * perWord;
    chunks.push({ text: g.join(" "), start: t, end: t + d });
    t += d;
  }
  return chunks;
}

const srtTime = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function toSrt(chunks: Chunk[]) {
  return chunks.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}

/** Narration starts this long after a scene begins. */
export const NARRATION_LEAD_S = 0.3;
