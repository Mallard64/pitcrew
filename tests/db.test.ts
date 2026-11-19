import { beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import { addArtifact, addFeedback, appendEvent, createJob, getStats, listArtifacts, listEvents, median, openDb, projectKey, setDb, updateJob } from "../src/lib/db";
import { takeJobSlot } from "../src/lib/ratelimit";
import { localBuildLog } from "../src/lib/buildlog";
import { tmpDir } from "./helpers";

beforeEach(() => setDb(openDb(path.join(tmpDir("pc-db-"), "t.db"))));

const mk = (url: string, status: "ok" | "partial" | "failed" | "queued", secs: number) => {
  const j = createJob({ project_name: "P", live_url: url, client_key: "k" });
  updateJob(j.id, { status, duration_ms: secs * 1000 });
  return j;
};

describe("db", () => {
  it("stores events, artifacts and feedback", () => {
    const j = createJob({ project_name: "P", live_url: "https://a.com", client_key: "k" });
    const e1 = appendEvent(j.id, "progress", "Opening", "opening");
    appendEvent(j.id, "log", "hello");
    expect(listEvents(j.id).map((e) => e.message)).toEqual(["Opening", "hello"]);
    expect(listEvents(j.id, e1.id)).toHaveLength(1);
    addArtifact({ job_id: j.id, version: 1, name: "demo.mp4", path: "/x", bytes: 10 });
    addArtifact({ job_id: j.id, version: 2, name: "demo.mp4", path: "/y", bytes: 20 });
    expect(listArtifacts(j.id, 2)[0].bytes).toBe(20);
    addFeedback({ job_id: j.id, rating: 1, quote: "great", can_quote: true });
    expect(getStats().thumbs_up).toBe(1);
  });

  it("computes stats honestly", () => {
    mk("https://a.com/", "ok", 100);
    mk("https://www.a.com", "partial", 200); // same project as above
    mk("https://b.com", "ok", 300);
    mk("https://c.com", "failed", 50);
    mk("https://d.com", "queued", 0);
    const s = getStats();
    expect(s.jobs_total).toBe(5);
    expect(s.jobs_finished).toBe(4);
    expect(s.jobs_ok).toBe(2);
    expect(s.videos_made).toBe(3);
    expect(s.unique_projects).toBe(2);
    expect(s.success_rate).toBeCloseTo(0.75);
    expect(s.median_duration_s).toBe(200);
  });

  it("totals delivered video length and counts demo sources", () => {
    const a = mk("https://e.com", "ok", 100);
    updateJob(a.id, { contract_json: JSON.stringify({ duration_s: 61.5 }) });
    const b = mk("https://f.com", "partial", 100);
    updateJob(b.id, { contract_json: JSON.stringify({ duration_s: 80 }), demo_mode: "sandbox-run" });
    const c = mk("https://g.com", "failed", 100);
    updateJob(c.id, { contract_json: JSON.stringify({ duration_s: 999 }), demo_mode: "footage" });
    const s = getStats();
    expect(s.video_seconds).toBe(142); // failed jobs don't count
    expect(s.by_mode["sandbox-run"]).toBe(1);
    expect(s.by_mode.footage).toBeUndefined();
    expect(s.by_mode.live).toBeGreaterThanOrEqual(1); // older jobs without a mode count as live
  });

  it("median + projectKey", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2, 10])).toBe(2.5);
    expect(projectKey("https://WWW.Foo.com/app/")).toBe("foo.com/app");
  });
});

describe("rate limits", () => {
  it("per-user daily cap", () => {
    process.env.MAX_JOBS_PER_USER_PER_DAY = "2";
    expect(takeJobSlot(["u1"]).ok).toBe(true);
    expect(takeJobSlot(["u1"]).ok).toBe(true);
    const r = takeJobSlot(["u1"]);
    expect(r.ok === false && r.reason).toBe("user");
    expect(takeJobSlot(["u2"]).ok).toBe(true);
    delete process.env.MAX_JOBS_PER_USER_PER_DAY;
  });
  it("global hourly cap shows high demand", () => {
    process.env.MAX_JOBS_PER_HOUR = "1";
    expect(takeJobSlot(["a"]).ok).toBe(true);
    const r = takeJobSlot(["b"]);
    expect(r.ok === false && r.reason).toBe("busy");
    delete process.env.MAX_JOBS_PER_HOUR;
  });
  it("global daily budget cap", () => {
    process.env.MAX_JOBS_PER_DAY = "1";
    takeJobSlot(["a"]);
    const r = takeJobSlot(["b"]);
    expect(r.ok === false && r.reason).toBe("budget");
    delete process.env.MAX_JOBS_PER_DAY;
  });
});

describe("localBuildLog", () => {
  it("groups by day, skips merges, stays under 600 words", () => {
    const commits = Array.from({ length: 300 }, (_, i) => ({
      sha: `abc${i}`, author: "x", date: new Date(Date.UTC(2026, 10, 15 + (i % 4), 12)).toISOString(),
      message: i % 10 === 0 ? "Merge pull request #1 from x/y" : `Add feature number ${i} with a few more words here`,
    }));
    const md = localBuildLog("P", commits);
    expect(md).toContain("## Nov 18, 2026"); // newest day kept when trimming
    expect(md).not.toContain("## Nov 15, 2026");
    expect(md).not.toContain("Merge pull request");
    expect(md.split(/\s+/).length).toBeLessThanOrEqual(620);
    expect(md).toContain("latest");
  });
});
