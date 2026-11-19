/** SQLite storage (better-sqlite3, WAL). One file at ${DATA_DIR}/pitcrew.db, migrated on open. */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";

export type JobStatus = "queued" | "running" | "review" | "ok" | "partial" | "failed";
export type Job = {
  id: string;
  created_at: number;
  project_name: string;
  live_url: string;
  repo_url: string | null;
  blurb: string | null;
  contact: string | null;
  client_key: string;
  status: JobStatus;
  session_id: string | null;
  error: string | null;
  duration_ms: number | null;
  version: number;
  render_mode: string | null;
  contract_json: string | null;
  plan_source: string | null;
  hr_session_id: string | null;
  problem: string | null;
  whats_next: string | null;
  style_kit: string | null;
  seed: number | null;
  is_finalist: number;
  paid: number;
  voice: string | null;
  look: string | null;
  review_script: number;
  length_s: number | null;
  closeups: number;
  evidence: string | null;
  built_with: string | null;
  ask: string | null;
  /** Upload id of the team's own demo footage, if any. */
  footage: string | null;
  /** Where the demo came from (live, sandbox-run, cli-run, footage, repo-showcase). */
  demo_mode: string | null;
  /** A note for the team on the job page (e.g. "upload 30 s of gameplay for a better video"). */
  notice: string | null;
};
export type JobEvent = { id: number; job_id: string; ts: number; kind: "progress" | "log" | "status"; step: string | null; message: string };
export type Artifact = { job_id: string; version: number; name: string; path: string; bytes: number };

const MIGRATIONS = [
  `CREATE TABLE jobs (
     id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, project_name TEXT NOT NULL, live_url TEXT NOT NULL,
     repo_url TEXT, blurb TEXT, contact TEXT, client_key TEXT NOT NULL, status TEXT NOT NULL,
     session_id TEXT, error TEXT, duration_ms INTEGER, version INTEGER NOT NULL DEFAULT 1,
     render_mode TEXT, contract_json TEXT, plan_source TEXT);
   CREATE INDEX jobs_created ON jobs(created_at);
   CREATE TABLE job_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, ts INTEGER NOT NULL,
     kind TEXT NOT NULL, step TEXT, message TEXT NOT NULL);
   CREATE INDEX job_events_job ON job_events(job_id, id);
   CREATE TABLE artifacts (
     job_id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, bytes INTEGER NOT NULL,
     PRIMARY KEY (job_id, version, name));
   CREATE TABLE feedback (
     id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, rating INTEGER NOT NULL,
     quote TEXT, can_quote INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
   CREATE TABLE rate_events (key TEXT NOT NULL, ts INTEGER NOT NULL);
   CREATE INDEX rate_events_key ON rate_events(key, ts);`,
  // session_id holds the latest HarnessRouter response id (for previous_response_id);
  // hr_session_id holds that response's metadata.session_id (for listing its files).
  `ALTER TABLE jobs ADD COLUMN hr_session_id TEXT;`,
  // Spec v2 (C3): pitch-video form fields, render identity, finalist + paid flags.
  `ALTER TABLE jobs ADD COLUMN problem TEXT;
   ALTER TABLE jobs ADD COLUMN whats_next TEXT;
   ALTER TABLE jobs ADD COLUMN style_kit TEXT;
   ALTER TABLE jobs ADD COLUMN seed INTEGER;
   ALTER TABLE jobs ADD COLUMN is_finalist INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE jobs ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;`,
  // Human-in-the-loop choices: narrator voice, forced look, pause for a script review before voicing.
  `ALTER TABLE jobs ADD COLUMN voice TEXT;
   ALTER TABLE jobs ADD COLUMN look TEXT;
   ALTER TABLE jobs ADD COLUMN review_script INTEGER NOT NULL DEFAULT 0;`,
  // Target video length (seconds, 30–180; null = the default 90–120s) and magnified UI close-ups.
  `ALTER TABLE jobs ADD COLUMN length_s INTEGER;
   ALTER TABLE jobs ADD COLUMN closeups INTEGER NOT NULL DEFAULT 0;`,
  // Pitch outline fields, team footage, GitHub-only projects (live_url may be '').
  `ALTER TABLE jobs ADD COLUMN evidence TEXT;
   ALTER TABLE jobs ADD COLUMN built_with TEXT;
   ALTER TABLE jobs ADD COLUMN ask TEXT;
   ALTER TABLE jobs ADD COLUMN footage TEXT;
   ALTER TABLE jobs ADD COLUMN demo_mode TEXT;
   ALTER TABLE jobs ADD COLUMN notice TEXT;`,
];

export function openDb(file?: string) {
  const f = file ?? path.join(config.dataDir, "pitcrew.db");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const db = new Database(f);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]);
    db.pragma(`user_version = ${i + 1}`);
  }
  return db;
}

const g = globalThis as unknown as { __pcDb?: Database.Database };
export function db(): Database.Database {
  if (!g.__pcDb) g.__pcDb = openDb();
  return g.__pcDb;
}
/** Tests only. */
export function setDb(d: Database.Database) {
  g.__pcDb = d;
}

export function createJob(input: {
  project_name: string; live_url: string; repo_url?: string; blurb?: string; problem?: string; whats_next?: string; contact?: string; client_key: string;
  voice?: string; look?: string; review_script?: boolean; length_s?: number; closeups?: boolean;
  evidence?: string; built_with?: string; ask?: string; footage?: string;
}): Job {
  const id = crypto.randomBytes(6).toString("base64url");
  db()
    .prepare(
      `INSERT INTO jobs (id, created_at, project_name, live_url, repo_url, blurb, problem, whats_next, contact, client_key, status, voice, look, review_script, length_s, closeups, evidence, built_with, ask, footage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, Date.now(), input.project_name, input.live_url, input.repo_url ?? null, input.blurb ?? null, input.problem ?? null, input.whats_next ?? null, input.contact ?? null, input.client_key, input.voice ?? null, input.look ?? null, input.review_script ? 1 : 0, input.length_s ?? null, input.closeups ? 1 : 0, input.evidence ?? null, input.built_with ?? null, input.ask ?? null, input.footage ?? null);
  return getJob(id)!;
}

export const getJob = (id: string) => db().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as Job | undefined;

export function updateJob(id: string, patch: Partial<Omit<Job, "id" | "created_at">>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  db()
    .prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`)
    .run({ ...patch, id });
}

export const listJobs = (limit = 200) => db().prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`).all(limit) as Job[];

export function appendEvent(jobId: string, kind: JobEvent["kind"], message: string, step: string | null = null): JobEvent {
  const ts = Date.now();
  const r = db().prepare(`INSERT INTO job_events (job_id, ts, kind, step, message) VALUES (?, ?, ?, ?, ?)`).run(jobId, ts, kind, step, message);
  return { id: Number(r.lastInsertRowid), job_id: jobId, ts, kind, step, message };
}

export const listEvents = (jobId: string, afterId = 0) =>
  db().prepare(`SELECT * FROM job_events WHERE job_id = ? AND id > ? ORDER BY id`).all(jobId, afterId) as JobEvent[];

export function addArtifact(a: Artifact) {
  db()
    .prepare(`INSERT OR REPLACE INTO artifacts (job_id, version, name, path, bytes) VALUES (@job_id, @version, @name, @path, @bytes)`)
    .run(a);
}

export const listArtifacts = (jobId: string, version?: number) =>
  (version === undefined
    ? db().prepare(`SELECT * FROM artifacts WHERE job_id = ? ORDER BY version, name`).all(jobId)
    : db().prepare(`SELECT * FROM artifacts WHERE job_id = ? AND version = ? ORDER BY name`).all(jobId, version)) as Artifact[];

export function addFeedback(f: { job_id: string; rating: 1 | -1; quote?: string; can_quote?: boolean }) {
  db()
    .prepare(`INSERT INTO feedback (job_id, rating, quote, can_quote, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(f.job_id, f.rating, f.quote?.trim() || null, f.can_quote ? 1 : 0, Date.now());
}

export const listQuotes = () =>
  db()
    .prepare(
      `SELECT f.quote, f.created_at, j.project_name FROM feedback f JOIN jobs j ON j.id = f.job_id
       WHERE f.can_quote = 1 AND f.rating = 1 AND f.quote IS NOT NULL ORDER BY f.created_at DESC LIMIT 50`,
    )
    .all() as { quote: string; created_at: number; project_name: string }[];

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Normalises a URL to host+path so the same project isn't counted twice. */
export function projectKey(url: string) {
  try {
    const u = new URL(url);
    return (u.host.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export type Stats = {
  jobs_total: number;
  jobs_finished: number;
  jobs_ok: number;
  videos_made: number;
  unique_projects: number;
  success_rate: number;
  median_duration_s: number;
  thumbs_up: number;
  thumbs_down: number;
};

export function getStats(): Stats {
  const jobs = db().prepare(`SELECT status, live_url, repo_url, duration_ms FROM jobs`).all() as Pick<Job, "status" | "live_url" | "repo_url" | "duration_ms">[];
  const finished = jobs.filter((j) => j.status === "ok" || j.status === "partial" || j.status === "failed");
  const made = finished.filter((j) => j.status !== "failed");
  const fb = db().prepare(`SELECT SUM(rating = 1) AS up, SUM(rating = -1) AS down FROM feedback`).get() as { up: number | null; down: number | null };
  return {
    jobs_total: jobs.length,
    jobs_finished: finished.length,
    jobs_ok: finished.filter((j) => j.status === "ok").length,
    videos_made: made.length,
    unique_projects: new Set(made.map((j) => (j.live_url ? projectKey(j.live_url) : (j.repo_url ?? "")))).size,
    success_rate: finished.length ? made.length / finished.length : 0,
    median_duration_s: Math.round(median(made.map((j) => (j.duration_ms ?? 0) / 1000))),
    thumbs_up: fb.up ?? 0,
    thumbs_down: fb.down ?? 0,
  };
}

export function recordRateEvent(key: string, ts = Date.now()) {
  db().prepare(`INSERT INTO rate_events (key, ts) VALUES (?, ?)`).run(key, ts);
}
export function countRateEvents(key: string, sinceTs: number) {
  return (db().prepare(`SELECT COUNT(*) AS n FROM rate_events WHERE key = ? AND ts >= ?`).get(key, sinceTs) as { n: number }).n;
}

/** Job fields safe to send to the browser (no contact info or client key). */
export function publicJob(j: Job) {
  return {
    id: j.id, created_at: j.created_at, project_name: j.project_name, live_url: j.live_url, status: j.status, version: j.version, error: j.error,
    duration_ms: j.duration_ms, render_mode: j.render_mode, contract_json: j.contract_json, plan_source: j.plan_source,
    style_kit: j.style_kit, seed: j.seed, voice: j.voice, review_script: !!j.review_script, length_s: j.length_s, closeups: !!j.closeups,
    repo_url: j.repo_url, demo_mode: j.demo_mode, notice: j.notice, has_footage: !!j.footage,
  };
}
