/**
 * Research-statistic verifier (C19). The agent proposes stats with a source URL and a verbatim quote;
 * we fetch that page ourselves and keep a stat only if its exact number AND unit appear in the page text.
 * Anything that fails is removed from the plan, including narration sentences that state the number.
 */
import type { Element, Source, VideoPlan } from "../../../harness/schemas/video_plan";
import { checkPublicUrl } from "../ssrf";

type Stat = Extract<Element, { type: "stat" }>;
export type FetchText = (url: string) => Promise<string>;

const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 4;

/** Fetches a public http(s) page as plain text. Every redirect hop goes through the SSRF check. */
export const fetchPublicText: FetchText = async (startUrl) => {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ok = await checkPublicUrl(url);
    if (!ok.ok) throw new Error(`blocked: ${ok.reason}`);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PitCrewSourceCheck/1.0)",
        Accept: "text/html,text/plain;q=0.9",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(type))
      throw new Error(`unsupported content type ${type.split(";")[0] || "unknown"}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error("page too large");
    return htmlToText(buf.toString("utf8"));
  }
  throw new Error("too many redirects");
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  percnt: "%",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ways a page may print the number: 1200 / 1,200, and 4.5 as-is. */
function numberForms(value: number): string[] {
  const plain = String(value);
  const [int, dec] = plain.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dec ? `.${dec}` : "");
  return [...new Set([plain, grouped])];
}

/** Regex for the number immediately followed by its unit (e.g. "42%", "42 percent", "3.5 million"). */
export function statPattern(value: number, unit?: string): RegExp {
  const num = `(?:${numberForms(value).map(esc).join("|")})`;
  const u = (unit ?? "").trim();
  let unitRe = "";
  if (u === "%") unitRe = `\\s?(?:%|percent\\b|per cent\\b)`;
  else if (/^x$/i.test(u)) unitRe = `\\s?(?:x\\b|×|times\\b)`;
  else if (u) unitRe = `\\s?${esc(u)}`;
  // No digit or decimal point directly before/after, so 42 doesn't match 142 or 42.5.
  return new RegExp(`(?<![\\d.,])${num}(?![\\d]|[.,]\\d)${unitRe}`, "i");
}

export type StatCheck = { ok: true; excerpt: string } | { ok: false; reason: string };

export function checkStatInText(text: string, value: number, unit?: string): StatCheck {
  const m = statPattern(value, unit).exec(text);
  if (!m)
    return {
      ok: false,
      reason: `"${value}${unit ? (unit === "%" ? "%" : ` ${unit}`) : ""}" not found on the page`,
    };
  const from = Math.max(0, text.lastIndexOf(" ", Math.max(0, m.index - 160)));
  const to = text.indexOf(" ", Math.min(text.length, m.index + m[0].length + 160));
  return {
    ok: true,
    excerpt: `${from > 0 ? "…" : ""}${text.slice(from, to < 0 ? undefined : to).trim()}${to > 0 ? "…" : ""}`,
  };
}

/**
 * Verifies every research source used by a stat element. Sets `verified` and replaces `quote` with the
 * excerpt we actually found, so sources.md shows ground truth rather than the agent's quote.
 */
export async function verifyResearch(
  plan: VideoPlan,
  fetchText: FetchText = fetchPublicText,
): Promise<string[]> {
  const notes: string[] = [];
  const stats = plan.scenes.flatMap((sc) =>
    sc.elements.filter((e): e is Stat => e.type === "stat"),
  );
  const pages = new Map<string, Promise<string>>();
  for (const src of plan.sources) {
    if (src.kind !== "research") continue;
    src.verified = false;
    const mine = stats.filter((s) => s.source_id === src.id);
    if (!mine.length) continue;
    try {
      if (!pages.has(src.url)) pages.set(src.url, fetchText(src.url));
      const text = await pages.get(src.url)!;
      const results = mine.map((s) => checkStatInText(text, s.value, s.unit));
      const bad = results.find((r) => !r.ok);
      if (bad && !bad.ok) {
        notes.push(`Dropped stat from ${src.source_name}: ${bad.reason} (${src.url})`);
        continue;
      }
      src.verified = true;
      src.quote = results.map((r) => (r.ok ? r.excerpt : "")).join(" … ");
      notes.push(`Verified stat "${src.stat}" on ${src.url}`);
    } catch (e) {
      notes.push(
        `Dropped stat from ${src.source_name}: could not fetch the source (${(e as Error).message.slice(0, 80)})`,
      );
    }
  }
  return notes;
}

/** Numbers a sentence states (digits only), e.g. "42%", "1,200". */
const NUMBER_IN_TEXT = /\d[\d,]*(?:\.\d+)?/g;

/**
 * In problem scenes, removes sentences and text elements that state a number we can't back:
 * anything not equal to a kept stat's value. Problem scenes are where research claims live.
 */
export function scrubUnbackedNumbers(plan: VideoPlan, keptValues: number[]): string[] {
  const notes: string[] = [];
  const allowed = new Set(keptValues.map((v) => String(v)));
  const backed = (s: string) =>
    (s.match(NUMBER_IN_TEXT) ?? []).every((n) => allowed.has(n.replace(/,/g, "")));
  const sentences = (t: string) => t.match(/[^.!?]+[.!?]*/g) ?? [];
  for (const sc of plan.scenes) {
    if (sc.section !== "problem") continue;
    const kept = sentences(sc.narration).filter(backed);
    if (kept.length !== sentences(sc.narration).length)
      notes.push(`Removed an unverified number from the ${sc.id} narration`);
    sc.narration = kept.join("").trim();
    sc.elements = sc.elements.filter((el) => {
      const text =
        el.type === "text" || el.type === "kinetic_headline"
          ? el.text
          : el.type === "bullets"
            ? el.items.join(" ")
            : "";
      if (text && !backed(text)) {
        notes.push(`Removed a ${el.type} with an unverified number from ${sc.id}`);
        return false;
      }
      return true;
    });
  }
  return notes;
}

/** sources.md: every statistic shown in the video with where it came from. */
export function sourcesMarkdown(
  projectName: string,
  sources: Source[],
  checkedAt = new Date(),
): string {
  const day = checkedAt.toISOString().slice(0, 10);
  const shown = sources.filter((s) => s.kind === "team-provided" || s.verified);
  if (!shown.length) return `# ${projectName}: sources\n\nThe video states no statistics.\n`;
  return (
    `# ${projectName}: sources\n\nEvery statistic in the pitch video, with its source. Research numbers were re-fetched and matched exactly (number and unit) on ${day}.\n\n` +
    shown
      .map((s) =>
        s.kind === "team-provided"
          ? `- **${s.stat}**: ${s.claim_text} (source: the team)`
          : `- **${s.stat}**: ${s.claim_text}\n  - ${s.source_name}, ${s.year}: <${s.url}>\n  - Page text: "${s.quote}"`,
      )
      .join("\n") +
    "\n"
  );
}
