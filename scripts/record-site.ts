/**
 * Screen-records the live Pit Crew site for our own demo video (1920x1080, smooth cursor, human typing).
 *   npx tsx scripts/record-site.ts run <out_dir>            -> a real job: form → progress → review (edit) → finished video
 *   npx tsx scripts/record-site.ts page <out_dir> <job_id>   -> an existing job page: badge, then the video playing
 * Writes <out_dir>/site.mp4 and events.json (seconds from the start for each moment, used for editing).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ffmpeg } from "../harness/scripts/ff";

const BASE = process.env.PITCREW_URL || "https://pitcrew-production-83e5860b.up.railway.app";
const [mode, outArg, jobArg] = process.argv.slice(2);
const out = path.resolve(outArg ?? "tmp/site-rec");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CURSOR = `(() => { if (window.__pc) return; window.__pc = 1;
  const add = () => { const d = document.createElement("div");
    d.style.cssText = "position:fixed;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,255,255,.92);border:3px solid #111;box-shadow:0 2px 10px rgba(0,0,0,.5);z-index:2147483647;pointer-events:none";
    document.documentElement.appendChild(d);
    addEventListener("mousemove", (e) => { d.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true); };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", add) : add(); })()`;

async function main() {
  fs.mkdirSync(path.join(out, "frames"), { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1.5,
  });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const t0 = Date.now();
  const frames: { file: string; t: number }[] = [];
  let chain: Promise<void> = Promise.resolve();
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    const t = Date.now() - t0;
    const last = frames.at(-1);
    const buf = Buffer.from(data, "base64");
    const file =
      last && t - last.t < 33
        ? last.file
        : path.join(out, "frames", `f${String(frames.length).padStart(6, "0")}.jpg`);
    if (file !== last?.file) frames.push({ file, t });
    chain = chain.then(() => fs.promises.writeFile(file, buf));
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 88,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });
  const events: Record<string, number> = {};
  const mark = (k: string) => {
    events[k] = Math.round((Date.now() - t0) / 100) / 10;
    console.log(`${events[k]}s ${k}`);
  };
  let pos = { x: 640, y: 360 };
  const moveTo = async (sel: string) => {
    const loc = page.locator(sel).first();
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) return loc;
    const to = { x: b.x + Math.min(b.width / 2, 60), y: b.y + b.height / 2 };
    for (let i = 1; i <= 24; i++) {
      const k = i / 24,
        e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await page.mouse.move(pos.x + (to.x - pos.x) * e, pos.y + (to.y - pos.y) * e);
      await sleep(16);
    }
    pos = to;
    await sleep(250);
    return loc;
  };
  const type = async (sel: string, text: string) => {
    const loc = await moveTo(sel);
    await loc.click();
    for (const ch of text) {
      await page.keyboard.type(ch);
      await sleep(70 + Math.random() * 40);
    }
    await sleep(400);
  };
  const smoothScroll = async (y: number) => {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), y);
    await sleep(1200);
  };

  if (mode === "run") {
    await page.goto(BASE, { waitUntil: "networkidle" });
    mark("home");
    await sleep(2500);
    const formTop = await page
      .locator("form[aria-label='Make a pitch video']")
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 40);
    await smoothScroll(formTop);
    mark("form");
    await type("input[name=project_name]", "Excalidraw");
    await type("input[name=live_url]", "excalidraw.com");
    const voice = await moveTo("select[name=voice]");
    await voice.selectOption("sarah");
    await sleep(700);
    const review = await moveTo("input[name=review_script]");
    await review.check();
    await sleep(900);
    const submit = await moveTo("form[aria-label='Make a pitch video'] button:not([type=button])");
    mark("submit");
    await submit.click();
    await page.waitForURL(/\/jobs\//, { timeout: 30000 });
    mark("job_page");
    fs.writeFileSync(path.join(out, "job.txt"), page.url().split("/jobs/")[1]);
    await page.locator("text=Voice and render this").waitFor({ timeout: 15 * 60 * 1000 });
    mark("review");
    await sleep(1000);
    await page.locator("textarea").first().scrollIntoViewIfNeeded();
    await sleep(2500);
    // Edit one line: append a true fact (Excalidraw is open source under the MIT license).
    const areas = page.locator("textarea");
    const idx = (await areas.count()) > 1 ? 1 : 0;
    const box = await areas.nth(idx).boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2, { steps: 20 });
      await areas.nth(idx).click();
      await page.keyboard.press("End");
      mark("edit");
      for (const ch of " It's free and open source.") {
        await page.keyboard.type(ch);
        await sleep(75);
      }
    }
    await sleep(1500);
    const go = await moveTo("text=Voice and render this");
    mark("approve");
    await go.click();
    await page
      .locator("video[src*='demo.mp4']")
      .first()
      .waitFor({ timeout: 15 * 60 * 1000 });
    mark("done");
    await sleep(2500);
  } else {
    await page.goto(`${BASE}/jobs/${jobArg}`, { waitUntil: "networkidle" });
    mark("page");
    await sleep(2500);
  }
  const video = page.locator("video[src*='demo.mp4']").first();
  await video.scrollIntoViewIfNeeded();
  await sleep(800);
  await moveTo("video[src*='demo.mp4']");
  mark("play");
  await video.evaluate(
    (v: HTMLVideoElement, at: number) => {
      v.currentTime = at;
      return v.play();
    },
    Number(process.env.SEEK_S ?? 0),
  );
  // Park the cursor off the video so it doesn't sit on the playing pitch.
  await page.mouse.move(1240, 700, { steps: 15 });
  await sleep(Number(process.env.PLAY_MS ?? 16000));
  mark("end");
  await cdp.send("Page.stopScreencast").catch(() => {});
  await chain;
  await browser.close();
  fs.writeFileSync(path.join(out, "events.json"), JSON.stringify(events, null, 2));
  // Constant 30 fps video from the timed frames.
  const end = Date.now() - t0;
  const list =
    frames
      .map(
        (f, i) =>
          `file '${f.file}'\nduration ${(((frames[i + 1]?.t ?? end) - f.t) / 1000).toFixed(3)}`,
      )
      .join("\n") + `\nfile '${frames.at(-1)!.file}'\n`;
  fs.writeFileSync(path.join(out, "frames.txt"), list);
  await ffmpeg(
    [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      path.join(out, "frames.txt"),
      "-vf",
      "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      path.join(out, "site.mp4"),
    ],
    30 * 60 * 1000,
  );
  fs.rmSync(path.join(out, "frames"), { recursive: true, force: true });
  console.log(`wrote ${path.join(out, "site.mp4")}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
