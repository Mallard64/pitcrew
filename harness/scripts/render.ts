/**
 * Renders title/end cards and caption overlays as PNGs with headless Chromium.
 * We draw text in the browser instead of ffmpeg's drawtext/subtitles filters because many
 * ffmpeg builds ship without libass/freetype; Chromium gives the same result everywhere.
 */
import { chromium } from "playwright";

export type PngJob = { html: string; out: string; transparent?: boolean };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FONT = `font-family: Inter, 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif;`;

export function cardHtml(kind: "title" | "end", title: string, sub: string) {
  const big = kind === "title" ? title : "Try it";
  const small = kind === "title" ? sub : sub;
  return `<!doctype html><html><body style="margin:0;width:1280px;height:720px;${FONT}
    background:radial-gradient(1200px 600px at 20% 10%,#1e293b,#020617);color:#fff;
    display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
    <div style="font-size:${big.length > 28 ? 64 : 84}px;font-weight:800;letter-spacing:-2px;max-width:1100px;line-height:1.05">${esc(big)}</div>
    <div style="margin-top:28px;font-size:34px;color:#cbd5e1;max-width:1100px;word-break:break-all">${esc(small)}</div>
    ${kind === "end" ? `<div style="position:absolute;bottom:36px;font-size:20px;color:#64748b">${esc(title)} · demo made with Pit Crew</div>` : ""}
  </body></html>`;
}

export function captionHtml(text: string) {
  return `<!doctype html><html><body style="margin:0;width:1280px;height:720px;background:transparent;${FONT}
    display:flex;align-items:flex-end;justify-content:center">
    <div style="margin-bottom:40px;max-width:1040px;padding:12px 22px;border-radius:10px;
      background:rgba(0,0,0,.72);color:#fff;font-size:32px;line-height:1.3;font-weight:600;text-align:center">${esc(text)}</div>
  </body></html>`;
}

export async function renderPngs(jobs: PngJob[]) {
  if (!jobs.length) return;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    for (const j of jobs) {
      await page.setContent(j.html, { waitUntil: "load" });
      await page.screenshot({ path: j.out, omitBackground: !!j.transparent });
    }
  } finally {
    await browser.close();
  }
}
