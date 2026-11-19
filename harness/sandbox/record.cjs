// Pit Crew sandbox recorder. Runs INSIDE the HarnessRouter sandbox (never on the Pit Crew server).
// Usage: NODE_PATH=$(npm root -g) node record.cjs flow.json
// Writes demo.webm, timings.json and shots/<step id>.png in the current directory.
const fs = require("fs");
const { chromium } = require("playwright");

const CURSOR = `(() => { if (window.__pcCursor) return; window.__pcCursor = 1;
  const add = () => { const d = document.createElement("div"); d.id = "__pc_cursor";
    d.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(20,20,20,.85);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;transition:transform .05s";
    document.documentElement.appendChild(d);
    addEventListener("mousemove", (e) => { d.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true); };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", add) : add(); })()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const flow = JSON.parse(fs.readFileSync(process.argv[2] || "flow.json", "utf8"));
  fs.mkdirSync("shots", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: "rec", size: { width: 1280, height: 720 } } });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const t0 = Date.now();
  let pos = { x: 640, y: 360 };
  const moveTo = async (loc) => {
    const b = await loc.boundingBox().catch(() => null);
    if (!b) return;
    const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    for (let i = 1; i <= 20; i++) {
      const k = i / 20, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await page.mouse.move(pos.x + (to.x - pos.x) * e, pos.y + (to.y - pos.y) * e);
      await sleep(16);
    }
    pos = to;
    await sleep(200);
  };
  const timings = [];
  for (const s of flow.steps) {
    const start = Date.now() - t0;
    let ok = true, error;
    try {
      if (s.action === "goto") await page.goto(s.url, { waitUntil: "load", timeout: 30000 });
      else if (s.action === "click" || s.action === "type") {
        const loc = page.locator(s.selector).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => loc.evaluate((el) => el.scrollIntoView({ block: "center" })));
        await moveTo(loc);
        await loc.click({ timeout: 8000 }).catch(() => loc.click({ force: true, timeout: 5000 }));
        if (s.action === "type") {
          await loc.selectText({ timeout: 1500 }).catch(() => {});
          await page.keyboard.type(s.text || "", { delay: 75 });
        }
      } else if (s.action === "scroll") await page.mouse.wheel(0, s.y || 600);
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    } catch (e) {
      ok = false;
      error = String(e.message || e).split("\n")[0].slice(0, 200);
    }
    await sleep(600);
    let box;
    const sel = s.zoom || (s.action === "click" || s.action === "type" ? s.selector : null);
    if (ok && sel) {
      const b = await page.locator(sel).first().boundingBox({ timeout: 1500 }).catch(() => null);
      if (b) box = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    }
    if (ok) await page.screenshot({ path: `shots/${s.id}.png`, timeout: 5000 }).catch(() => {});
    if (ok) await sleep(Math.max(0, (s.hold_ms || 3000) - 600));
    timings.push({ step_id: s.id, ok, start_ms: start, end_ms: Date.now() - t0, ...(error ? { error } : {}), ...(box ? { box } : {}) });
    console.log(`step ${s.id} ${ok ? "ok" : "failed: " + error}`);
  }
  const video = page.video();
  await ctx.close();
  await browser.close();
  fs.renameSync(await video.path(), "demo.webm");
  fs.writeFileSync("timings.json", JSON.stringify(timings, null, 2));
  console.log(`recorded ${timings.filter((t) => t.ok).length}/${timings.length} steps`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
