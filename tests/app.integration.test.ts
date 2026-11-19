/** End to end through the API route handlers: create -> SSE events -> done -> download -> revise. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { openDb, setDb } from "../src/lib/db";
import { serveDir, tmpDir } from "./helpers";
import { POST as createJob } from "../src/app/api/jobs/route";
import { GET as getJob } from "../src/app/api/jobs/[id]/route";
import { GET as events } from "../src/app/api/jobs/[id]/events/route";
import { POST as revise } from "../src/app/api/jobs/[id]/revise/route";
import { POST as review } from "../src/app/api/jobs/[id]/review/route";
import { GET as file } from "../src/app/api/jobs/[id]/files/[name]/route";

let site: { url: string; close: () => Promise<void> };
beforeAll(async () => {
  process.env.PITCREW_TEST_ALLOW_LOCAL = "1";
  process.env.HARNESS_MODE = "mock";
  process.env.TTS_PROVIDER = "none";
  // Fast render settings: this test checks the app flow; quality settings are covered elsewhere.
  process.env.RENDER_FPS = "30";
  process.env.RECORD_SCALE = "1";
  process.env.DATA_DIR = tmpDir("pc-app-");
  setDb(openDb(path.join(process.env.DATA_DIR, "pitcrew.db")));
  site = await serveDir(path.resolve(__dirname, "fixtures/site"));
});
afterAll(async () => {
  await site.close();
  delete process.env.PITCREW_TEST_ALLOW_LOCAL;
  delete process.env.RENDER_FPS;
  delete process.env.RECORD_SCALE;
});

const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

async function readSse(id: string, after = 0) {
  const res = await events(new Request(`http://t/api/jobs/${id}/events?after=${after}`), ctx({ id }));
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  const text = await res.text(); // stream closes on the final status
  return text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
}

describe("API", () => {
  it("rejects private URLs", async () => {
    delete process.env.PITCREW_TEST_ALLOW_LOCAL;
    const res = await createJob(new Request("http://t/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project_name: "x", live_url: "http://10.0.0.1" }) }));
    expect(res.status).toBe(400);
    process.env.PITCREW_TEST_ALLOW_LOCAL = "1";
  });

  it("create -> progress -> video -> download -> revise", async () => {
    const res = await createJob(new Request("http://t/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({ project_name: "Fixture App", live_url: `${site.url}/index.html`, blurb: "A tiny app for testing the Pit Crew pipeline end to end." }),
    }));
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const evs = await readSse(id);
    const steps = evs.filter((e) => e.kind === "progress").map((e) => e.step);
    expect(steps).toEqual(["opening", "planning", "recording", "narrating", "voicing", "assembling"]);
    expect(evs.at(-1)).toMatchObject({ kind: "status" });
    expect(["ok", "partial"]).toContain(evs.at(-1).message);

    const job = await (await getJob(new Request(`http://t/api/jobs/${id}`), ctx({ id }))).json();
    expect(job.artifacts.map((a: { name: string }) => a.name)).toEqual(expect.arrayContaining(["demo.mp4", "captions.srt", "script.md"]));
    expect(job.job.contact).toBeUndefined();

    const vid = await file(new Request(`http://t/api/jobs/${id}/files/demo.mp4`, { headers: { range: "bytes=0-99" } }), ctx({ id, name: "demo.mp4" }));
    expect(vid.status).toBe(206);
    expect(vid.headers.get("content-type")).toBe("video/mp4");
    expect((await vid.arrayBuffer()).byteLength).toBe(100);
    const bad = await file(new Request(`http://t/x`), ctx({ id, name: "../pitcrew.db" }));
    expect(bad.status).toBe(404);

    const rv = await revise(new Request(`http://t/api/jobs/${id}/revise`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: "make it shorter" }) }), ctx({ id }));
    expect(rv.status).toBe(202);
    const lastId = evs.at(-1).id;
    const evs2 = await readSse(id, lastId);
    expect(evs2.at(-1).kind).toBe("status");
    const job2 = await (await getJob(new Request(`http://t/api/jobs/${id}`), ctx({ id }))).json();
    expect(job2.job.version).toBe(2);
    expect(job2.artifacts.every((a: { version: number }) => a.version === 2)).toBe(true);
  }, 240_000);

  it("pauses for a script review, applies the team's edit, look and voice", async () => {
    const res = await createJob(new Request("http://t/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "5.6.7.8" },
      body: JSON.stringify({ project_name: "Fixture App", live_url: `${site.url}/index.html`, look: "studio", voice: "george", review_script: true, length_s: 120, closeups: true }),
    }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const get = async () => (await getJob(new Request(`http://t/api/jobs/${id}`), ctx({ id }))).json();

    let job = await get();
    for (let i = 0; i < 240 && job.job.status !== "review"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      job = await get();
    }
    expect(job.job.status).toBe("review");
    expect(job.review.voice).toBe("george");
    expect(job.review.look).toBe("studio");
    expect(job.review.report.total).toBeGreaterThan(0);
    const target = job.review.scenes.find((s: { section: string }) => s.section === "solution") ?? job.review.scenes[0];

    const bad = await review(new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenes: [{ id: "x", narration: "a".repeat(500) }] }) }), ctx({ id }));
    expect(bad.status).toBe(400);
    const ok = await review(new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenes: [{ id: target.id, narration: "Fixture App turns a messy test page into a clear story." }] }) }), ctx({ id }));
    expect(ok.status).toBe(200);
    const again = await review(new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenes: [] }) }), ctx({ id }));
    expect(again.status).toBe(409);

    const evs = await readSse(id);
    expect(["ok", "partial"]).toContain(evs.at(-1).message);
    expect(evs.some((e) => e.message.includes("You edited 1 scene"))).toBe(true);
    job = await get();
    expect(job.job.style_kit).toBe("studio");
    expect(job.artifacts.map((a: { name: string }) => a.name)).toEqual(expect.arrayContaining(["pitch_check.json", "pitch_check.md"]));
    const script = await (await file(new Request(`http://t/x`), ctx({ id, name: "script.md" }))).text();
    expect(script).toContain("Fixture App turns a messy test page into a clear story.");
    // Length and close-ups are the team's call: stored on the job and carried into the rendered plan.
    expect(job.job.length_s).toBe(120);
    expect(job.job.closeups).toBe(true);
    const vp = await (await file(new Request(`http://t/x`), ctx({ id, name: "video_plan.json" }))).json();
    expect(vp.target_s).toBe(120);
    const clips = vp.scenes.flatMap((s: { elements: { type: string; zoom?: string }[] }) => s.elements).filter((e: { type: string }) => e.type === "clip");
    expect(clips.length).toBeGreaterThan(0);
    expect(clips.every((c: { zoom?: string }) => c.zoom === "inspect")).toBe(true);
  }, 300_000);
});
