/**
 * Executes a flow JSON in headless Chromium, records the session and takes one screenshot per step.
 *
 * CLI: tsx harness/scripts/record_flow.ts <flow.json> <out_dir>
 * Outputs: <out_dir>/recording.mp4, <out_dir>/shots/<step_id>.png, <out_dir>/timings.json
 * Exit code: 0 if at least one step succeeded, 2 otherwise.
 *
 * Polish (C17): eased cursor moves, human-speed typing, a hold after each action, and per step
 * the target's bounding box, the cursor path and any loading window (spinner/progress) so
 * polish_footage.ts can zoom to the target and speed up dead time.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { ffmpeg } from "./ff";
import { FlowSchema, type Flow, type Step } from "../schemas/flow";

export type Box = { x: number; y: number; w: number; h: number };
export type CursorPoint = { t: number; x: number; y: number };

export type StepTiming = {
  step_id: string;
  ok: boolean;
  start_ms: number;
  end_ms: number;
  error?: string;
  /** Bounding box (viewport px) of the zoom target after the action. */
  box?: Box;
  /** Cursor positions during the step, ms relative to video start. */
  cursor?: CursorPoint[];
  /** Time a loading indicator was visible after the action (dead time), ms relative to video start. */
  wait?: { start_ms: number; end_ms: number };
};

export type RecordResult = {
  timings: StepTiming[];
  videoPath: string;
  stepsOk: number;
};

export type RecordOptions = {
  /** Return false to block a request (used for the SSRF guard). */
  allowRequest?: (url: string) => boolean | Promise<boolean>;
  log?: (msg: string) => void;
  stepTimeoutMs?: number;
  /** Max time to wait for loading indicators to disappear after an action. */
  readyTimeoutMs?: number;
};


/**
 * Records the page with Chrome's screencast at device-pixel resolution. Playwright's recordVideo
 * captures at CSS size whatever the deviceScaleFactor, which made zoomed scenes blurry.
 * Frames arrive only when the page repaints; each one is held until the next.
 */
class ScreenRecorder {
  private frames: { file: string; t: number }[] = [];
  private writes: Promise<void>[] = [];
  private cdp?: Awaited<ReturnType<BrowserContext["newCDPSession"]>>;
  constructor(
    private dir: string,
    private t0: number,
  ) {}

  async start(context: BrowserContext, page: Page, size: { width: number; height: number }) {
    const cdp = (this.cdp = await context.newCDPSession(page));
    cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
      const file = path.join(this.dir, `f${String(this.frames.length).padStart(6, "0")}.jpg`);
      this.frames.push({ file, t: Date.now() - this.t0 });
      this.writes.push(fs.writeFile(file, Buffer.from(data, "base64")));
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 100,
      maxWidth: size.width,
      maxHeight: size.height,
      everyNthFrame: 1,
    });
  }

  /** Encodes the frames into a constant-30fps H.264 file whose t=0 is t0. Returns false if no frames. */
  async stop(outFile: string, endMs: number, size: { width: number; height: number }) {
    await this.cdp?.send("Page.stopScreencast").catch(() => {});
    await Promise.all(this.writes);
    if (!this.frames.length) return false;
    const lines: string[] = [];
    this.frames.forEach((f, i) => {
      const from = i === 0 ? 0 : f.t;
      const to = i + 1 < this.frames.length ? this.frames[i + 1].t : Math.max(endMs, f.t + 34);
      lines.push(`file '${path.basename(f.file)}'`, `duration ${(Math.max(1, to - from) / 1000).toFixed(3)}`);
    });
    // The concat demuxer ignores the last duration unless the last file is listed again.
    lines.push(`file '${path.basename(this.frames[this.frames.length - 1].file)}'`);
    const list = path.join(this.dir, "frames.txt");
    await fs.writeFile(list, lines.join("\n"));
    const { width: w, height: h } = size;
    await ffmpeg([
      "-f", "concat", "-safe", "0", "-i", list,
      "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=60,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-an", outFile,
    ]);
    return true;
  }
}

/** Device-pixel ratio for recording; 2 keeps 1.8x zooms sharp in a 1080p render. */
export const recordScale = () => Number(process.env.RECORD_SCALE) || 2;
const SETTLE_MS = 700;
const TYPE_DELAY_MS: [number, number] = [60, 90];

// A visible cursor so viewers can follow clicks; Playwright's headless video has none.
const CURSOR_SCRIPT = `
  (() => {
    const install = () => {
      if (document.getElementById('__pc_cursor')) return;
      const c = document.createElement('div');
      c.id = '__pc_cursor';
      c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;' +
        'border-radius:50%;background:rgba(255,72,72,.35);border:2px solid rgba(255,72,72,.9);' +
        'pointer-events:none;left:-50px;top:-50px;transition:transform .15s ease';
      document.documentElement.appendChild(c);
      addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
      addEventListener('mousedown', () => { c.style.transform = 'scale(.7)'; }, true);
      addEventListener('mouseup', () => { c.style.transform = 'scale(1)'; }, true);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  })();
`;

// Plain JS string (not a function) so bundlers can't inject helpers into browser code.
const LOADING_JS = `(() => {
  const sel = '[aria-busy="true"],[role="progressbar"],.spinner,.loading,.loader,[class*="spinner"],[class*="Spinner"],[class*="skeleton"],[class*="Skeleton"],[class*="loading"]';
  for (const el of document.querySelectorAll(sel)) {
    if (el.id === '__pc_cursor') continue;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (r.width > 4 && r.height > 4 && st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0') return true;
  }
  return false;
})()`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

class Recorder {
  private pos = { x: 640, y: 360 };
  cursor: CursorPoint[] = [];
  constructor(
    private page: Page,
    private t0: number,
  ) {}

  now() {
    return Date.now() - this.t0;
  }

  /** Eased move; 18–30 intermediate points depending on distance. */
  async moveTo(x: number, y: number) {
    const dist = Math.hypot(x - this.pos.x, y - this.pos.y);
    const steps = Math.round(Math.min(30, Math.max(18, dist / 25)));
    const from = { ...this.pos };
    this.cursor.push({ t: this.now(), ...from });
    for (let i = 1; i <= steps; i++) {
      const k = easeInOut(i / steps);
      await this.page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
      await sleep(14);
    }
    this.pos = { x, y };
    this.cursor.push({ t: this.now(), x, y });
  }

  async moveToSelector(selector: string, timeout: number) {
    const loc = this.page.locator(selector).first();
    await loc.scrollIntoViewIfNeeded({ timeout });
    const box = await loc.boundingBox({ timeout });
    if (box) {
      await this.moveTo(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(250);
    }
    return loc;
  }

  /** Waits for visible loading indicators to clear; returns the window they were visible, if any. */
  async waitForReady(maxMs: number, since?: number): Promise<StepTiming["wait"]> {
    const isLoading = () => this.page.evaluate(LOADING_JS).catch(() => false) as Promise<boolean>;
    if (!(await isLoading())) return undefined;
    // Count from when the action finished (page painted), not from this first check.
    const start = since ?? this.now();
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline && (await isLoading())) await sleep(100);
    return { start_ms: start, end_ms: this.now() };
  }
}

async function dismissCookieBanner(page: Page) {
  const btn = page
    .getByRole("button", { name: /^(accept( all)?|agree|i agree|got it|ok|allow all)$/i })
    .first();
  try {
    if (await btn.isVisible({ timeout: 300 })) await btn.click({ timeout: 1000 });
  } catch {
    /* no banner */
  }
}

/** Runs one step; returns when the action itself finished (ms since video start), for dead-time timing. */
async function runStep(rec: Recorder, page: Page, step: Step, timeout: number): Promise<number> {
  let done = 0;
  switch (step.action) {
    case "goto":
      await page.goto(step.url!, { waitUntil: "domcontentloaded", timeout });
      done = rec.now();
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      await dismissCookieBanner(page);
      break;
    case "click": {
      const loc = await rec.moveToSelector(step.selector!, timeout);
      await loc.click({ timeout });
      done = rec.now();
      await page.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => {});
      break;
    }
    case "type": {
      const loc = await rec.moveToSelector(step.selector!, timeout);
      await loc.click({ timeout });
      // Human speed: 60–90ms per character, jittered.
      for (const ch of step.text ?? "") {
        await page.keyboard.type(ch);
        await sleep(between(...TYPE_DELAY_MS));
      }
      break;
    }
    case "scroll":
      await page.evaluate(`window.scrollBy({ top: ${Number(step.y ?? 600)}, behavior: "smooth" })`);
      await sleep(600); // let smooth scrolling finish before measuring boxes
      break;
    case "wait":
      break;
  }
  return done || rec.now();
}

async function targetBox(page: Page, step: Step): Promise<Box | undefined> {
  const selector = step.zoom ?? (step.action === "click" || step.action === "type" ? step.selector : undefined);
  if (!selector) return undefined;
  try {
    const b = await page.locator(selector).first().boundingBox({ timeout: 1500 });
    if (!b || b.width < 1 || b.height < 1) return undefined;
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  } catch {
    return undefined;
  }
}

export async function recordFlow(
  flowInput: unknown,
  outDir: string,
  opts: RecordOptions = {},
): Promise<RecordResult> {
  const flow: Flow = FlowSchema.parse(flowInput);
  const log = opts.log ?? (() => {});
  // STEP_TIMEOUT_MS: slow hosts (small containers) need longer for page loads.
  const envTimeout = Number(process.env.STEP_TIMEOUT_MS) || 0;
  const timeout = opts.stepTimeoutMs ?? (envTimeout || 10_000);
  const readyTimeout = opts.readyTimeoutMs ?? (envTimeout || 10_000);
  const shotsDir = path.join(outDir, "shots");
  const rawDir = path.join(outDir, ".raw-video");
  await fs.mkdir(shotsDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const timings: StepTiming[] = [];
  let videoPath = path.join(outDir, "recording.mp4");
  const RECORD_SCALE = recordScale();
  const pixelSize = {
    width: Math.round(flow.viewport.width * RECORD_SCALE / 2) * 2,
    height: Math.round(flow.viewport.height * RECORD_SCALE / 2) * 2,
  };
  try {
    const context = await browser.newContext({
      viewport: flow.viewport,
      // Render at RECORD_SCALE pixel density (2560x1440 for a 1280x720 viewport) so zoomed scenes stay sharp.
      // Layout, boxes and cursor stay in CSS px.
      deviceScaleFactor: RECORD_SCALE,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 PitCrew/1.0",
    });
    await context.addInitScript(CURSOR_SCRIPT);
    if (opts.allowRequest) {
      const allow = opts.allowRequest;
      await context.route("**/*", async (route) => {
        if (await allow(route.request().url())) return route.continue();
        log(`blocked request: ${route.request().url()}`);
        return route.abort("blockedbyclient");
      });
    }
    const page = await context.newPage();
    const t0 = Date.now();
    const screen = new ScreenRecorder(rawDir, t0);
    await screen.start(context, page, pixelSize);
    const rec = new Recorder(page, t0);
    page.mouse.move(640, 360).catch(() => {});

    for (const step of flow.steps) {
      const start = rec.now();
      rec.cursor = [];
      let ok = true;
      let error: string | undefined;
      let wait: StepTiming["wait"];
      try {
        const actionDone = await runStep(rec, page, step, timeout);
        wait = await rec.waitForReady(readyTimeout, actionDone);
      } catch (e) {
        ok = false;
        error = (e as Error).message.split("\n")[0].slice(0, 300);
        log(`step ${step.id} (${step.action}) failed: ${error}`);
      }
      // The hold starts once the page is ready, so dead time never eats into it.
      const afterAction = Date.now();
      await sleep(Math.min(SETTLE_MS, step.hold_ms));
      const box = ok ? await targetBox(page, step) : undefined;
      if (ok) {
        await page
          .screenshot({ path: path.join(shotsDir, `${step.id}.png`), timeout: 5000 })
          .catch((e) => log(`screenshot ${step.id} failed: ${(e as Error).message}`));
      }
      const elapsedHold = Date.now() - afterAction;
      // Failed steps are dropped from the cut, so don't spend video time on them.
      if (ok) await sleep(Math.max(0, step.hold_ms - elapsedHold));
      const t: StepTiming = { step_id: step.id, ok, start_ms: start, end_ms: rec.now() };
      if (error) t.error = error;
      if (box) t.box = box;
      if (rec.cursor.length) t.cursor = rec.cursor;
      if (wait && wait.end_ms - wait.start_ms >= 300) t.wait = wait;
      timings.push(t);
      if (ok) log(`step ${step.id} ok${t.wait ? ` (waited ${t.wait.end_ms - t.wait.start_ms}ms for loading)` : ""}`);
    }

    const recorded = await screen.stop(videoPath, rec.now(), pixelSize);
    if (!recorded) videoPath = "";
    await context.close();
  } finally {
    await browser.close();
    await fs.rm(rawDir, { recursive: true, force: true });
  }

  await fs.writeFile(path.join(outDir, "timings.json"), JSON.stringify(timings, null, 2));
  return { timings, videoPath, stepsOk: timings.filter((t) => t.ok).length };
}

async function main() {
  const [flowPath, outDir] = process.argv.slice(2);
  if (!flowPath || !outDir) {
    console.error("usage: tsx harness/scripts/record_flow.ts <flow.json> <out_dir>");
    process.exit(1);
  }
  const flow = JSON.parse(await fs.readFile(flowPath, "utf8"));
  const res = await recordFlow(flow, outDir, { log: (m) => console.error(m) });
  console.log(JSON.stringify({ steps_ok: res.stepsOk, steps_total: res.timings.length }));
  process.exit(res.stepsOk >= 1 ? 0 : 2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
