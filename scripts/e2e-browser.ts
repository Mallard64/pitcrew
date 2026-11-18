/**
 * Browser end-to-end check of the real site, as a team would use it: landing page (desktop + phone,
 * checks for sideways overflow), fill the form, submit, watch live progress, then verify the video and
 * every download link. Screenshots go to <out_dir>.
 * Usage: tsx scripts/e2e-browser.ts <out_dir> [base_url] [project_name] [live_url] [repo_url]
 * Needs a running server (npm start). With HARNESS_MODE=real this spends one real agent run.
 */
import { chromium } from "playwright";
const [OUT, BASE = "http://localhost:3123", NAME = "JSON Crack", LIVE = "https://jsoncrack.com", REPO = "https://github.com/AykutSarac/jsoncrack.com"] = process.argv.slice(2);
if (!OUT) throw new Error("usage: tsx scripts/e2e-browser.ts <out_dir> [base_url] [project_name] [live_url] [repo_url]");
(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  desk.on("pageerror", (e) => errors.push(e.message));
  desk.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await desk.goto(BASE, { waitUntil: "networkidle" });
  await desk.screenshot({ path: `${OUT}/landing-desktop.png`, fullPage: true });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.goto(BASE, { waitUntil: "networkidle" });
  await phone.screenshot({ path: `${OUT}/landing-phone.png`, fullPage: true });
  const overflow = await phone.evaluate("document.documentElement.scrollWidth > window.innerWidth");
  console.log("phone horizontal overflow:", overflow);
  await phone.close();

  // Submit through the real form.
  await desk.click("text=Make my pitch video >> nth=0");
  await desk.fill('input[name="project_name"]', NAME);
  await desk.fill('input[name="live_url"]', LIVE);
  if (REPO) await desk.fill('input[name="repo_url"]', REPO);
  await desk.locator("#make form").screenshot({ path: `${OUT}/form-filled.png` });
  await Promise.all([desk.waitForURL(/\/jobs\//, { timeout: 30000 }), desk.click('#make button:has-text("Make my pitch video")')]);
  console.log("job page:", desk.url());
  await desk.waitForTimeout(45000);
  await desk.screenshot({ path: `${OUT}/job-progress.png`, fullPage: true });
  const t0 = Date.now();
  await desk.waitForSelector("video", { timeout: 20 * 60 * 1000 });
  console.log("finished after", Math.round((Date.now() - t0) / 1000 + 45), "s on the page");
  await desk.waitForTimeout(1500);
  await desk.screenshot({ path: `${OUT}/job-done.png`, fullPage: true });
  const meta = await desk.locator("video + p").first().innerText().catch(() => "");
  console.log("meta:", meta.replace(/\n/g, " | "));
  const links = await desk.$$eval("aside a[href*='/files/']", (as) => as.map((a) => [a.textContent?.trim() ?? "", (a as HTMLAnchorElement).href]));
  for (const [label, href] of links) {
    const r = await desk.request.get(href);
    console.log("download", r.status(), (await r.body()).length, "bytes", label.replace(/\s+/g, " "));
  }
  console.log("page errors:", errors.length ? errors.slice(0, 5) : "none");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
