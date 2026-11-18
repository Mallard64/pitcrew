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
import { runPipeline } from "./pipeline";
import type { Flow } from "../../harness/schemas/flow";

type Task = { jobId: string; revision?: string };
type RunnerState = { queue: Task[]; active: number; running: Set<string>; bus: EventEmitter; recovered: boolean; plannerOverride?: Planner };

const g = globalThis as unknown as { __pcRunner?: RunnerState };
function state(): RunnerState {
  if (!g.__pcRunner) {
    const bus = new EventEmitter();
    bus.setMaxListeners(0);
    g.__pcRunner = { queue: [], active: 0, running: new Set(), bus, recovered: false };
  }
  return g.__pcRunner;
}

/** Tests only. */
export function setPlannerForTests(p: Planner | undefined) {
  state().plannerOverride = p;
}

export const jobDir = (id: string) => path.join(config.dataDir, "jobs", id);

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
    if (j.status === "running") {
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

  let timer: NodeJS.Timeout | undefined;
  try {
    const planner = state().plannerOverride ?? getPlanner();
    const work = runPipeline(
      { projectName: job.project_name, liveUrl: job.live_url, repoUrl: job.repo_url ?? undefined, blurb: job.blurb ?? undefined, problem: job.problem ?? undefined, whatsNext: job.whats_next ?? undefined, user: job.client_key },
      jobDir(jobId),
      version,
      (e) => (e.type === "progress" ? emit(jobId, "progress", e.message, e.step) : emit(jobId, "log", e.message)),
      planner,
      revision && previous ? { request: revision, previous, sessionId: job.session_id ?? undefined } : undefined,
    );
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`Timed out after ${Math.round(config.jobTimeoutMs / 60000)} minutes`)), config.jobTimeoutMs);
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
    const message = (e as Error).message.slice(0, 500);
    // A failed revision keeps the previous good version visible.
    const keepPrevious = !!revision && (job.status === "ok" || job.status === "partial");
    updateJob(jobId, keepPrevious ? { status: job.status, error: `Revision failed: ${message}` } : { status: "failed", error: message, duration_ms: Date.now() - started });
    emit(jobId, "log", `Error: ${message}`);
    emit(jobId, "status", keepPrevious ? job.status : "failed");
  } finally {
    clearTimeout(timer);
  }
}
