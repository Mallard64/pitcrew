/**
 * In-process job queue. Jobs run with bounded concurrency; events are persisted to SQLite
 * and fanned out live to SSE subscribers.
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { addArtifact, appendEvent, getJob, listJobs, updateJob, type JobEvent } from "./db";
import { getPlanner, type Planner } from "./harness";
import { runPipeline, type ReviewDraft } from "./pipeline";
import type { Flow } from "../../harness/schemas/flow";

type Task = { jobId: string; revision?: string };
type Edits = { id: string; narration: string }[] | null;
type PendingReview = { draft: ReviewDraft; deadline: number; resolve: (edits: Edits) => void; cancel: () => void };
type RunnerState = {
  queue: Task[]; active: number; running: Set<string>; bus: EventEmitter; recovered: boolean; plannerOverride?: Planner;
  reviews: Map<string, PendingReview>;
};

/** How long a job waits for the team's script review before continuing with the draft as written. */
export const REVIEW_WAIT_MS = 10 * 60_000;

const g = globalThis as unknown as { __pcRunner?: RunnerState };
function state(): RunnerState {
  if (!g.__pcRunner) {
    const bus = new EventEmitter();
    bus.setMaxListeners(0);
    g.__pcRunner = { queue: [], active: 0, running: new Set(), bus, recovered: false, reviews: new Map() };
  }
  return g.__pcRunner;
}

/** Tests only. */
export function setPlannerForTests(p: Planner | undefined) {
  state().plannerOverride = p;
}

export const jobDir = (id: string) => path.join(config.dataDir, "jobs", id);

/** A finished job keeps ~30–40 MB (mostly the 1080p60 video); refuse to start without room for one. */
const MIN_FREE_BYTES = (Number(process.env.MIN_FREE_MB) || 120) * 1024 * 1024;
function freeBytes(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const st = fs.statfsSync(dir);
    return st.bavail * st.bsize;
  } catch {
    return Infinity; // can't tell: don't block the job
  }
}
const STORAGE_FULL = "Pit Crew's video storage is full right now, so this job can't run. Please try again later.";

function emit(jobId: string, kind: JobEvent["kind"], message: string, step: string | null = null) {
  const ev = appendEvent(jobId, kind, message, step);
  state().bus.emit(jobId, ev);
}

export function subscribe(jobId: string, cb: (e: JobEvent) => void) {
  state().bus.on(jobId, cb);
  return () => state().bus.off(jobId, cb);
}

/** After a restart, queued jobs are re-queued and interrupted ones are marked failed. */
function recover() {
  const s = state();
  if (s.recovered) return;
  s.recovered = true;
  for (const j of listJobs(500)) {
    if (j.status === "running" || j.status === "review") {
      updateJob(j.id, { status: "failed", error: "Server restarted while this job was running. Please submit again." });
      emit(j.id, "status", "failed");
    } else if (j.status === "queued") s.queue.push({ jobId: j.id });
  }
}

/** Adds a task unless that job is already queued or running (one run per job at a time). */
export function enqueue(task: Task): boolean {
  recover();
  const s = state();
  const duplicate = s.running.has(task.jobId) || s.queue.some((t) => t.jobId === task.jobId);
  if (!duplicate) s.queue.push(task);
  pump(); // always: recover() may have queued work
  return !duplicate;
}

export const queuePosition = (jobId: string) => state().queue.findIndex((t) => t.jobId === jobId);

/** The draft waiting for review, if any (for GET /api/jobs/:id). */
export function pendingReview(jobId: string) {
  const r = state().reviews.get(jobId);
  return r ? { ...r.draft, deadline: r.deadline } : null;
}

/** Resumes a job waiting for review with the team's edits (null = approve as written). */
export function submitReview(jobId: string, edits: Edits): boolean {
  const r = state().reviews.get(jobId);
  if (!r) return false;
  r.resolve(edits);
  return true;
}

function pump() {
  const s = state();
  while (s.active < config.maxConcurrentJobs && s.queue.length) {
    const task = s.queue.shift()!;
    s.active++;
    s.running.add(task.jobId);
    run(task)
      .catch((e) => console.error("runner crash", e))
      .finally(() => {
        s.active--;
        s.running.delete(task.jobId);
        pump();
      });
  }
}

async function run({ jobId, revision }: Task) {
  const job = getJob(jobId);
  if (!job) return;
  const version = revision ? job.version + 1 : 1;
  const started = Date.now();
  updateJob(jobId, { status: "running", error: null });
  emit(jobId, "status", "running");

  let previous: Flow | undefined;
  if (revision) {
    try {
      previous = JSON.parse(fs.readFileSync(path.join(jobDir(jobId), `v${job.version}`, "flow.json"), "utf8"));
    } catch {
      /* planner will start fresh */
    }
  }

  // The job timeout counts working time only: it pauses while the team reviews the script.
  let timer: NodeJS.Timeout | undefined;
  // Longer videos take longer to record, voice and render: about 5s of budget per second over 90s.
  let totalBudget = config.jobTimeoutMs + Math.max(0, (job.length_s ?? 0) - 90) * 5000;
  let budget = totalBudget;
  let armedAt = Date.now();
  let fail: (e: Error) => void = () => {};
  const arm = () => {
    armedAt = Date.now();
    timer = setTimeout(() => fail(new Error(`Timed out after ${Math.round(totalBudget / 60000)} minutes`)), budget);
  };
  const pause = () => {
    clearTimeout(timer);
    budget -= Date.now() - armedAt;
  };
  const extendBudget = (ms: number) => {
    pause();
    budget += ms;
    totalBudget += ms;
    arm();
  };
  const awaitReview = (draft: ReviewDraft) =>
    new Promise<Edits>((resolve) => {
      pause();
      const deadline = Date.now() + REVIEW_WAIT_MS;
      const auto = setTimeout(() => done(null, "No review within 10 minutes; continuing with the script as written"), REVIEW_WAIT_MS);
      const done = (edits: Edits, note?: string) => {
        clearTimeout(auto);
        state().reviews.delete(jobId);
        if (note) emit(jobId, "log", note);
        updateJob(jobId, { status: "running" });
        emit(jobId, "status", "running");
        arm();
        resolve(edits);
      };
      const cancel = () => {
        clearTimeout(auto);
        state().reviews.delete(jobId);
      };
      state().reviews.set(jobId, { draft, deadline, resolve: (e) => done(e), cancel });
      updateJob(jobId, { status: "review" });
      emit(jobId, "status", "review");
    });
  try {
    if (freeBytes(config.dataDir) < MIN_FREE_BYTES) throw new Error(STORAGE_FULL);
    const planner = state().plannerOverride ?? getPlanner();
    const work = runPipeline(
      {
        projectName: job.project_name, liveUrl: job.live_url, repoUrl: job.repo_url ?? undefined, blurb: job.blurb ?? undefined, problem: job.problem ?? undefined,
        whatsNext: job.whats_next ?? undefined, user: job.client_key, voice: job.voice ?? undefined, look: job.look ?? undefined,
        // Revisions are already reviewed by the request itself; only first runs pause.
        reviewScript: !!job.review_script && !revision,
        lengthS: job.length_s ?? undefined,
        closeups: !!job.closeups,
      },
      jobDir(jobId),
      version,
      (e) => (e.type === "progress" ? emit(jobId, "progress", e.message, e.step) : emit(jobId, "log", e.message)),
      planner,
      revision && previous ? { request: revision, previous, sessionId: job.session_id ?? undefined } : undefined,
      { awaitReview, extendBudget },
    );
    const timeout = new Promise<never>((_, rej) => {
      fail = rej;
      arm();
    });
    const res = await Promise.race([work, timeout]);
    const dir = path.join(jobDir(jobId), `v${version}`);
    for (const name of res.files) addArtifact({ job_id: jobId, version, name, path: path.join(dir, name), bytes: fs.statSync(path.join(dir, name)).size });
    const status = res.contract.status === "failed" ? "failed" : res.contract.status;
    updateJob(jobId, {
      status,
      version,
      duration_ms: Date.now() - started,
      render_mode: res.contract.render_mode,
      contract_json: JSON.stringify(res.contract),
      session_id: res.sessionId ?? job.session_id,
      hr_session_id: res.hrSessionId ?? job.hr_session_id,
      plan_source: res.planSource,
      style_kit: res.videoPlan.style_kit,
      seed: res.videoPlan.seed,
      error: status === "failed" ? res.contract.notes || "Rendering failed" : null,
    });
    if (res.contract.notes) emit(jobId, "log", `Notes: ${res.contract.notes}`);
    emit(jobId, "status", status);
  } catch (e) {
    const raw = (e as NodeJS.ErrnoException).code === "ENOSPC" || /ENOSPC/.test((e as Error).message) ? STORAGE_FULL : (e as Error).message;
    const message = raw.slice(0, 500);
    // A failed revision keeps the previous good version visible.
    const keepPrevious = !!revision && (job.status === "ok" || job.status === "partial");
    updateJob(jobId, keepPrevious ? { status: job.status, error: `Revision failed: ${message}` } : { status: "failed", error: message, duration_ms: Date.now() - started });
    emit(jobId, "log", `Error: ${message}`);
    emit(jobId, "status", keepPrevious ? job.status : "failed");
  } finally {
    clearTimeout(timer);
    // A job that ended while waiting (timeout) must not resume later.
    state().reviews.get(jobId)?.cancel();
  }
}
