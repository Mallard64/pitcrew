/**
 * Server-side research (C19): Brave web search for the agent's queries, then fetch the top pages and pull
 * out sentences that state a number. These are only *candidates*: the agent picks from them and
 * verify.ts re-checks the exact number on the page before anything reaches the video.
 */
import { fetchPublicText, type FetchText } from "./verify";

export type Candidate = { id: string; url: string; title: string; sentence: string };
type SearchHit = { url: string; title: string };
export type Search = (query: string) => Promise<SearchHit[]>;

/** Brave Search API. Needs BRAVE_API_KEY. Only the query text leaves our server. */
export function braveSearch(apiKey: string, fetchImpl: typeof fetch = fetch): Search {
  return async (query) => {
    const u = new URL("https://api.search.brave.com/res/v1/web/search");
    u.searchParams.set("q", query);
    u.searchParams.set("count", "6");
    u.searchParams.set("safesearch", "strict");
    const res = await fetchImpl(u, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Brave search HTTP ${res.status}`);
    const j = (await res.json()) as { web?: { results?: { url?: string; title?: string }[] } };
    return (j.web?.results ?? [])
      .filter((r) => r.url && /^https?:/.test(r.url))
      .map((r) => ({ url: r.url!, title: r.title ?? "" }));
  };
}

// Pages that only repeat other people's numbers, need JS/login, or aren't sources we'd cite.
const SKIP_HOST =
  /(^|\.)(wikipedia\.org|reddit\.com|quora\.com|youtube\.com|facebook\.com|x\.com|twitter\.com|linkedin\.com|pinterest\.com|tiktok\.com|instagram\.com|medium\.com)$/i;
const STAT_WORDS =
  /(%|\bpercent\b|\bper cent\b|\bmillion\b|\bbillion\b|\bhours?\b|\bminutes?\b|\bdays?\b|\btimes\b|\bin \d+\b|\bout of\b|\$\s?\d)/i;

/** Sentences of 8–45 words that state a number with a unit-ish word (percent, million, hours, 1 in 5...). */
export function statSentences(text: string, max = 3): string[] {
  const out: string[] = [];
  // Protect decimals and common abbreviations so "23.4%" or "U.S." don't end a sentence.
  const DOT = "\u2024";
  const safe = text
    .replace(/(\d)\.(\d)/g, `$1${DOT}$2`)
    .replace(/\b(U\.S|U\.K|e\.g|i\.e|vs|approx|Dr|Mr|Ms|No)\./g, (m) => m.replace(/\./g, DOT));
  for (const raw of safe.match(/[^.!?]{20,400}[.!?](?=\s|$)/g) ?? []) {
    const s = raw.trim().replace(new RegExp(DOT, "g"), ".");
    const words = s.split(/\s+/);
    // Headlines and nav soup are mostly Title Case; real sentences aren't.
    if (words.filter((w) => /^[A-Z]/.test(w)).length / words.length > 0.4) continue;
    if (words.length < 8 || words.length > 45) continue;
    if (!/\d/.test(s) || !STAT_WORDS.test(s)) continue;
    // Skip cookie banners, nav soup and copyright lines.
    if (/cookie|©|copyright|subscribe|sign up|log in|javascript/i.test(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

/** Search each query, open the top results and collect up to `limit` candidate sentences. */
export async function findCandidates(
  queries: string[],
  opts: {
    search: Search;
    fetchText?: FetchText;
    limit?: number;
    pagesPerQuery?: number;
    log?: (m: string) => void;
  },
): Promise<Candidate[]> {
  const fetchText = opts.fetchText ?? fetchPublicText;
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const q of queries.slice(0, 3)) {
    try {
      for (const h of (await opts.search(q)).slice(0, opts.pagesPerQuery ?? 4)) {
        const host = new URL(h.url).hostname;
        if (SKIP_HOST.test(host) || seen.has(h.url) || /\.pdf($|\?)/i.test(h.url)) continue;
        seen.add(h.url);
        hits.push(h);
      }
    } catch (e) {
      opts.log?.(`search failed for "${q}": ${(e as Error).message}`);
    }
  }
  const perPage = await pool(hits, 4, async (h) => {
    try {
      return statSentences(await fetchText(h.url)).map((sentence) => ({
        url: h.url,
        title: h.title,
        sentence,
      }));
    } catch {
      return [];
    }
  });
  return perPage
    .flat()
    .slice(0, opts.limit ?? 12)
    .map((c, i) => ({ id: `c${i + 1}`, ...c }));
}

/** The follow-up message that hands the candidates to the agent. */
export function researchPrompt(candidates: Candidate[]): string {
  const list = candidates
    .map((c) => `[${c.id}] ${c.title}\n    ${c.url}\n    "${c.sentence}"`)
    .join("\n");
  return (
    `Our server searched the web for your research_queries and found these sentences on real pages:\n${list}\n\n` +
    `Update ONLY the problem scene and "sources": add at most 2 stat elements from these candidates that genuinely show the problem is real (who is affected, how often, what it costs). ` +
    `Use the candidate's exact url, copy the number and unit exactly as written in its sentence, quote = that sentence, kind "research", verified false, ` +
    `source_name = the publisher (from the title or domain), year = the year the page states (or the current year if none). ` +
    `Prefer government, academic and major survey publishers; skip vendor marketing claims and anything off-topic. If none fits honestly, change nothing. ` +
    `Put each number in its own narration sentence and keep the problem scene 10–15s. Do not change the flow, demo scenes or anything else. Reply with the full JSON block again (same format).`
  );
}
