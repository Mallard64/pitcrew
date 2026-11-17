/**
 * Executes a flow JSON in headless Chromium, records the session and takes one screenshot per step.
 *
 * CLI: tsx harness/scripts/record_flow.ts <flow.json> <out_dir>
 * Outputs: <out_dir>/recording.webm, <out_dir>/shots/<step_id>.png, <out_dir>/timings.json
 * Exit code: 0 if at least one step succeeded, 2 otherwise.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { FlowSchema, type Flow, type Step } from "../schemas/flow";

export type StepTiming = {
  step_id: string;
  ok: boolean;
  start_ms: number;
  end_ms: number;
  error?: string;
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
};

const SETTLE_MS = 700;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function moveCursorTo(page: Page, selector: string, timeout: number) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded({ timeout });
  const box = await loc.boundingBox({ timeout });
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await sleep(250);
  }
  return loc;
}

async function runStep(page: Page, step: Step, timeout: number) {
  switch (step.action) {
    case "goto":
      await page.goto(step.url!, { waitUntil: "domcontentloaded", timeout });
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      await dismissCookieBanner(page);
      break;
    case "click": {
      const loc = await moveCursorTo(page, step.selector!, timeout);
      await loc.click({ timeout });
      await page.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => {});
      break;
    }
    case "type": {
      const loc = await moveCursorTo(page, step.selector!, timeout);
      await loc.click({ timeout });
      await loc.pressSequentially(step.text ?? "", { delay: 60, timeout: Math.max(timeout, 20000) });
      break;
    }
    case "scroll":
      await page.evaluate(`window.scrollBy({ top: ${Number(step.y ?? 600)}, behavior: "smooth" })`);
      break;
    case "wait":
      break;
  }
}

export async function recordFlow(
  flowInput: unknown,
  outDir: string,
  opts: RecordOptions = {},
): Promise<RecordResult> {
  const flow: Flow = FlowSchema.parse(flowInput);
  const log = opts.log ?? (() => {});
  const timeout = opts.stepTimeoutMs ?? 10_000;
  const shotsDir = path.join(outDir, "shots");
  const rawDir = path.join(outDir, ".raw-video");
  await fs.mkdir(shotsDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const timings: StepTiming[] = [];
  let videoPath = path.join(outDir, "recording.webm");
  try {
    const context = await browser.newContext({
      viewport: flow.viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: rawDir, size: flow.viewport },
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
    page.mouse.move(640, 360).catch(() => {});

    for (const step of flow.steps) {
      const start = Date.now() - t0;
      let ok = true;
      let error: string | undefined;
      try {
        await runStep(page, step, timeout);
      } catch (e) {
        ok = false;
        error = (e as Error).message.split("\n")[0].slice(0, 300);
        log(`step ${step.id} (${step.action}) failed: ${error}`);
      }
      const afterAction = Date.now();
      await sleep(Math.min(SETTLE_MS, step.hold_ms));
      if (ok) {
        await page
          .screenshot({ path: path.join(shotsDir, `${step.id}.png`), timeout: 5000 })
          .catch((e) => log(`screenshot ${step.id} failed: ${(e as Error).message}`));
      }
      const elapsedHold = Date.now() - afterAction;
      // Failed steps are dropped from the cut, so don't spend video time on them.
      if (ok) await sleep(Math.max(0, step.hold_ms - elapsedHold));
      timings.push({ step_id: step.id, ok, start_ms: start, end_ms: Date.now() - t0, error });
      if (ok) log(`step ${step.id} ok`);
    }

    const video = page.video();
    await context.close();
    if (video) {
      await fs.rename(await video.path(), videoPath);
    } else {
      videoPath = "";
    }
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
