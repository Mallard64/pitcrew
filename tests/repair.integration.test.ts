// End to end: a click step whose selector doesn't exist fails, the (scripted) agent fixes it from the
// candidates we send, and the flow is recorded again with every step working.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { openDb, setDb } from "../src/lib/db";
import { serveDir, tmpDir } from "./helpers";
import { POST as createJob } from "../src/app/api/jobs/route";
import { GET as getJob } from "../src/app/api/jobs/[id]/route";
import { GET as events } from "../src/app/api/jobs/[id]/events/route";
import { GET as file } from "../src/app/api/jobs/[id]/files/[name]/route";
import { setPlannerForTests } from "../src/lib/runner";
import { localVideoPlan } from "../src/lib/planner/video";
import type { Planner, PlannerEvent, PlanRequest } from "../src/lib/harness";
import type { Flow } from "../harness/schemas/flow";

let site: { url: string; close: () => Promise<void> };
const prompts: string[] = [];

function flowFor(url: string, goSelector: string): Flow {
  return {
    project_name: "Fixture App",
    url: `${url}/index.html`,
    viewport: { width: 1280, height: 720 },
    steps: [
      { id: "s1", action: "goto", url: `${url}/index.html`, hold_ms: 2500, say: "The fixture app opens on its home page with one button." },
      { id: "s2", action: "click", selector: goSelector, hold_ms: 2500, say: "Click get started and the page answers right away." },
      { id: "s3", action: "click", selector: "#about", hold_ms: 2500, say: "The about page explains what the app is for." },
    ],
  };
}

const scripted: Planner = {
  name: "scripted",
  async *plan(req: PlanRequest): AsyncIterable<PlannerEvent> {
    const flow = flowFor(site.url, "text=Begin now"); // not on the page
    const videoPlan = localVideoPlan(req, flow, req.digest, 7);
    yield { type: "plan", flow, videoPlan, source: "harness", sessionId: "resp_test" };
  },
  async *revise(): AsyncIterable<PlannerEvent> {
    throw new Error("not used");
  },
  async *research(req: { sessionId: string; prompt: string }): AsyncIterable<PlannerEvent> {
    prompts.push(req.prompt);
    const fixed = req.prompt.startsWith("Demo repair");
    const flow = flowFor(site.url, fixed ? "#go" : "text=Begin now");
    const videoPlan = localVideoPlan({ projectName: "Fixture App", liveUrl: flow.url }, flow, undefined, 7);
    yield { type: "plan", flow, videoPlan, source: "harness", sessionId: "resp_test2" };
  },
};

beforeAll(async () => {
  process.env.PITCREW_TEST_ALLOW_LOCAL = "1";
  process.env.TTS_PROVIDER = "none";
  process.env.RENDER_FPS = "30";
  process.env.RECORD_SCALE = "1";
  process.env.STEP_TIMEOUT_MS = "4000";
  process.env.DATA_DIR = tmpDir("pc-repair-");
  setDb(openDb(path.join(process.env.DATA_DIR, "pitcrew.db")));
  site = await serveDir(path.resolve(__dirname, "fixtures/site"));
  setPlannerForTests(scripted);
});
afterAll(async () => {
  setPlannerForTests(undefined);
  await site.close();
  for (const k of ["PITCREW_TEST_ALLOW_LOCAL", "RENDER_FPS", "RECORD_SCALE", "STEP_TIMEOUT_MS"]) delete process.env[k];
});

const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

describe("demo step repair", () => {
  it("fixes a failed selector from the page's real elements and records again", async () => {
    const res = await createJob(new Request("http://t/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({ project_name: "Fixture App", live_url: `${site.url}/index.html` }),
    }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const sse = await (await events(new Request(`http://t/api/jobs/${id}/events`), ctx({ id }))).text();
    const msgs = sse.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)).message as string);

    expect(msgs).toContain("2/3 steps recorded");
    const repair = prompts.find((p) => p.startsWith("Demo repair"));
    expect(repair).toContain("s2 (click text=Begin now)");
    expect(repair).toContain('text="Get started"'); // the real button was offered as a candidate
    expect(msgs).toContain("3/3 steps recorded after the fix");

    const job = (await (await getJob(new Request(`http://t/api/jobs/${id}`), ctx({ id }))).json()).job;
    // A 3-step fixture video is far below 60s, so the job is "partial" for length only, not for steps.
    const contract = JSON.parse(job.contract_json);
    expect(contract.steps_ok).toBe(3);
    expect(contract.notes).not.toMatch(/failed steps/);
    const flow = await (await file(new Request("http://t/x"), ctx({ id, name: "flow.json" }))).json();
    expect(flow.steps[1].selector).toBe("#go");
    expect(flow.steps[1].say).toBe("Click get started and the page answers right away.");
  }, 300_000);
});
