/**
 * Visits a site (home + a few internal pages) and collects a compact "digest": the facts the planner
 * may use to write a click-flow and narration. Everything in it comes from the page itself.
 */
import { chromium, type Page } from "playwright";

export type Section = { heading: string; text: string; y: number };
export type PageDigest = {
  url: string;
  title: string;
  description: string;
  h1: string;
  sections: Section[];
  links: { text: string; href: string }[];
  inputs: { selector: string; placeholder: string }[];
  height: number;
};
export type SiteDigest = { home: PageDigest; pages: PageDigest[]; finalUrl: string };

const SKIP_LINK =
  /(log ?in|sign ?in|sign ?up|register|logout|privacy|terms|cookie|legal|careers|jobs|status|twitter|github|discord|linkedin|mailto:|tel:)/i;
const GOOD_LINK =
  /(feature|product|demo|how|pricing|docs|about|tour|example|gallery|explore|dashboard|app|try|play|showcase)/i;

// Plain JS string (not a function) so bundlers can't inject helpers like __name into browser code.
const DIGEST_JS = `(() => {
  const clean = (s, n = 240) => (s || "").replace(/\\s+/g, " ").trim().slice(0, n);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
  };
  const meta = (sel) => (document.querySelector(sel) || {}).content || "";
  const sections = [];
  document.querySelectorAll("h1, h2, h3").forEach((h) => {
    if (!visible(h)) return;
    const heading = clean(h.textContent, 90);
    if (heading.length < 3) return;
    let text = "";
    let el = h;
    for (let i = 0; i < 6 && el && !text; i++) {
      el = el.nextElementSibling || (el.parentElement && el.parentElement.nextElementSibling) || null;
      if (el && /^(P|DIV|SPAN|UL|SECTION)$/.test(el.tagName)) {
        const t = clean(el.textContent, 220);
        if (t.length > 25) text = t;
      }
    }
    sections.push({ heading, text, y: Math.round(h.getBoundingClientRect().top + scrollY) });
  });
  const seen = new Set();
  const links = [];
  document.querySelectorAll("a[href]").forEach((a) => {
    if (!visible(a)) return;
    const text = clean(a.textContent, 40);
    let u;
    try { u = new URL(a.href, location.href); } catch { return; }
    u.hash = "";
    if (u.origin !== location.origin || u.href === location.href || seen.has(u.href) || text.length < 2) return;
    seen.add(u.href);
    links.push({ text, href: u.href });
  });
  const inputs = [];
  document.querySelectorAll("input, textarea").forEach((i) => {
    const type = (i.getAttribute("type") || "text").toLowerCase();
    if (!["text", "search", ""].includes(type) && i.tagName !== "TEXTAREA") return;
    if (!visible(i) || /pass|email|card|phone/i.test(i.name + i.id + i.placeholder)) return;
    if (i.getBoundingClientRect().top + scrollY > 1400) return;
    const tag = i.tagName.toLowerCase();
    const selector = i.id ? "#" + CSS.escape(i.id)
      : i.name ? tag + '[name="' + i.name + '"]'
      : i.placeholder ? tag + '[placeholder="' + i.placeholder.replace(/"/g, '\\\\"') + '"]' : "";
    if (selector) inputs.push({ selector, placeholder: clean(i.placeholder, 60) });
  });
  const h1 = document.querySelector("h1");
  return {
    url: location.href,
    title: clean(document.title, 120),
    description: clean(meta('meta[name="description"]') || meta('meta[property="og:description"]'), 300),
    h1: clean(h1 && h1.textContent, 120),
    sections: sections.slice(0, 20),
    links: links.slice(0, 40),
    inputs: inputs.slice(0, 3),
    height: document.documentElement.scrollHeight,
  };
})()`;

const digestPage = (page: Page) => page.evaluate(DIGEST_JS) as Promise<PageDigest>;

export async function exploreSite(
  url: string,
  opts: {
    allowRequest?: (u: string) => Promise<boolean>;
    maxPages?: number;
    log?: (m: string) => void;
  } = {},
): Promise<SiteDigest> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    if (opts.allowRequest) {
      const allow = opts.allowRequest;
      await context.route("**/*", async (route) =>
        (await allow(route.request().url())) ? route.continue() : route.abort("blockedbyclient"),
      );
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const home = await digestPage(page);
    const finalUrl = page.url();

    const candidates = home.links
      .filter((l) => !SKIP_LINK.test(l.text + " " + l.href))
      .sort(
        (a, b) => Number(GOOD_LINK.test(b.text + b.href)) - Number(GOOD_LINK.test(a.text + a.href)),
      );
    const pages: PageDigest[] = [];
    for (const l of candidates.slice(0, opts.maxPages ?? 3)) {
      try {
        await page.goto(l.href, { waitUntil: "domcontentloaded", timeout: 12_000 });
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
        const d = await digestPage(page);
        if (d.h1 || d.sections.length || d.title) pages.push(d);
      } catch (e) {
        opts.log?.(`could not open ${l.href}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    return { home, pages, finalUrl };
  } finally {
    await browser.close();
  }
}
