# CODEX_TASKS

Do them in order, unless a task says it can run in parallel. Each is self-contained.
Order: C0 → (C1, C2, C3 in parallel) → C4 → C5 → C6 → C7 → C8 → C9 → C10

---

## [ ] C0 Repo scaffold
**Paths:** root config files, `harness/schemas/`
- pnpm workspace-free single package; Next.js (App Router, TS strict, Tailwind); vitest; eslint + prettier.
- Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.
- `.env.example` with vars from SPEC.md. `.gitignore` includes `.env`, `/data`, `logs/`, `eval/samples/*.mp4`.
- `harness/schemas/flow.ts`: zod schema:
```ts
Step = { id: string; action: "goto"|"click"|"type"|"scroll"|"wait"; url?: string; selector?: string; text?: string; y?: number; hold_ms: number (1000..8000); say: string (≤25 words) }
Flow = { project_name: string; url: string(url); viewport: {width:1280,height:720}; steps: Step[] (1..12) }
```
- `harness/schemas/script.ts`: `Segment = { step_id: string; text: string }`, `Script = { segments: Segment[] }`.
- `harness/schemas/contract.ts`: `{ status: "ok"|"partial"|"failed"; render_mode: "recording"|"slideshow"; duration_s: number; steps_ok: number; steps_total: number; notes: string }`.

**Acceptance:** `pnpm lint && pnpm typecheck && pnpm test` pass; the schemas have tests for valid and invalid examples.

---

## [ ] C1 `record_flow.ts`: Playwright recorder
**Paths:** `harness/scripts/record_flow.ts`, `tests/record_flow.test.ts`, `tests/fixtures/site/`
**CLI:** `tsx harness/scripts/record_flow.ts <flow.json> <out_dir>`
- Validate the flow with the schema. Launch Chromium (headless), context with `recordVideo` at 1280×720.
- For each step: perform the action (goto/click/type with ~60ms per char delay/scroll smooth/wait), then wait `hold_ms`. Take a screenshot `out_dir/shots/<step_id>.png` after the action.
- Per-step timeout 10s. On failure: log, mark the step failed, continue.
- Write `out_dir/recording.webm` and `out_dir/timings.json`: `[{step_id, ok, start_ms, end_ms, error?}]` (relative to video start).
- Exit 0 if ≥1 step ok, else exit 2.
**Acceptance:** test serves `tests/fixtures/site/` (a 3-page static site with a button and input) on a local port; a 5-step flow produces a webm (ffprobe duration within ±1.5s of the sum of hold_ms), 5 screenshots, and correct timings; a flow with a bad selector marks that step failed and still exits 0.

---

## [ ] C2 `tts.ts`: TTS adapter
**Paths:** `harness/scripts/tts.ts`, `harness/scripts/tts/*.ts`, `tests/tts.test.ts`
**CLI:** `tsx harness/scripts/tts.ts <script.json> <out_dir>`; env `TTS_PROVIDER`, `TTS_API_KEY`, optional `TTS_VOICE`.
- Providers: `openai` (HTTP TTS endpoint, mp3), `elevenlabs` (HTTP, mp3), `piper` (spawn `piper` binary if on PATH), `none` (generate silence with ffmpeg; duration = words / 2.5 seconds).
- Output: `out_dir/audio/<step_id>.mp3` + `out_dir/audio/durations.json`: `[{step_id, duration_s}]` (measured with ffprobe).
- Retry provider calls 2× with backoff; on final failure fall back to `none` for that segment and record `fallback: true`.
**Acceptance:** tests mock fetch for openai/elevenlabs (return a tiny valid mp3 fixture); `none` produces correct-length silence; durations come from ffprobe.

---

## [ ] C3 `assemble.ts`: video assembly
**Paths:** `harness/scripts/assemble.ts`, `tests/assemble.test.ts`
**CLI:** `tsx harness/scripts/assemble.ts <out_dir> --title "<project_name>" --url "<url>"`
**Inputs in out_dir:** `recording.webm`, `timings.json`, `script.json`, `audio/*.mp3`, `audio/durations.json`.
- Build `captions.srt` from segments; each caption starts at its step's `start_ms`.
- Place each audio segment at its step's `start_ms`. If audio is longer than the step window, slow that video segment (`setpts`) or hold the last frame so narration never overlaps the next step.
- Title card (2s, project name, dark background, large white text) + end card (2s, "Try it: <url>").
- Burn captions (readable: white text, semi-transparent black box, bottom).
- Output `demo.mp4`: 1280×720, H.264 `-preset veryfast -crf 23`, AAC 128k, `+faststart`; plus `thumb.jpg` (frame at 3s).
- Print the contract JSON (C0 schema) to stdout.
**Acceptance:** test synthesizes inputs with ffmpeg (`testsrc` webm + sine-tone mp3s); output passes ffprobe checks (codec, resolution, duration ≈ 4s + content), SRT is valid, and the stdout JSON validates.

---

## [ ] C4 `slideshow.ts`: fallback renderer
**Paths:** `harness/scripts/slideshow.ts`, `tests/slideshow.test.ts`
**CLI:** `tsx harness/scripts/slideshow.ts <out_dir> --title ... --url ...`
- Inputs: `shots/*.png`, `script.json`, `audio/`. Each screenshot is shown for its audio duration + 0.5s with a slow zoom (zoompan, ~1.0→1.06) and crossfades. Same cards, captions, encoding and outputs as C3; `render_mode: "slideshow"`.
**Acceptance:** works from synthetic PNGs + audio; same ffprobe checks as C3.

---

## [ ] C5 Database layer
**Paths:** `src/lib/db.ts`, `src/lib/repo/*.ts`, `tests/db.test.ts`
- `better-sqlite3`, file at `${DATA_DIR}/pitcrew.db`, WAL mode, migrations on boot.
- Tables (see SPEC.md data model): `jobs`, `job_events(job_id, ts, step, message)`, `artifacts`, `feedback`, `rate_events(key, ts)`.
- Repo functions: `createJob`, `updateJob`, `appendEvent`, `listEvents(jobId, afterTs)`, `addArtifact`, `listArtifacts`, `addFeedback`, `getStats()` → `{ jobs_total, jobs_ok, unique_projects, median_duration_s, success_rate }`.
**Acceptance:** unit tests against a temp db cover all functions; `getStats` math is tested.

---

## [ ] C6 Validation, SSRF guard, rate limits
**Paths:** `src/lib/validate.ts`, `src/lib/ssrf.ts`, `src/lib/ratelimit.ts`, tests
- Form schema (zod): `project_name` 1–80 chars, `live_url` http(s), `repo_url` optional, must match `https://github.com/<owner>/<repo>`, `blurb` ≤300, `contact` ≤100.
- SSRF: resolve DNS; reject private, loopback, link-local, metadata (169.254.169.254) and IPv6 equivalents; reject non-80/443 ports.
- Rate limit (SQLite-backed): global `MAX_JOBS_PER_HOUR`, per-key `MAX_JOBS_PER_USER_PER_DAY` (key = contact or IP hash).
**Acceptance:** table-driven tests, including `http://localhost`, `http://10.0.0.1`, `http://[::1]` and a hostname resolving to a private IP (mock DNS).

---

## [ ] C7 Harness client interface + mock
**Paths:** `src/lib/harness/types.ts`, `src/lib/harness/mock.ts`, `src/lib/harness/index.ts`, `tests/fixtures/harness/`
Claude Code will write the real HarnessRouter implementation later. You write the interface and a mock that the whole app runs on.
```ts
export type HarnessEvent =
  | { type: "progress"; step: "opening"|"planning"|"recording"|"narrating"|"voicing"|"assembling"; message: string }
  | { type: "log"; message: string }
  | { type: "done"; contract: Contract; files: { name: string; url?: string; path?: string }[]; sessionId: string }
  | { type: "error"; message: string };
export interface HarnessClient {
  run(input: { projectName: string; liveUrl: string; repoUrl?: string; blurb?: string }): AsyncIterable<HarnessEvent>;
  revise(sessionId: string, request: string): AsyncIterable<HarnessEvent>;
  fetchFile(file: { url?: string; path?: string }, dest: string): Promise<void>;
}
```
- `MockHarnessClient`: replays fixture events with realistic delays (total ~20s; env `MOCK_FAST=1` → 1s) and copies fixture files (a small sample mp4, srt, md).
- `getHarnessClient()` returns the mock when `HARNESS_MODE=mock` (default) and the real client (`src/lib/harness/real.ts`, stub that throws "not implemented") when `HARNESS_MODE=real`.
**Acceptance:** tests consume the mock iterator end to end.

---

## [ ] C8 Job runner + SSE
**Paths:** `src/lib/runner.ts`, `src/app/api/jobs/route.ts`, `src/app/api/jobs/[id]/events/route.ts`, `src/app/api/jobs/[id]/revise/route.ts`, `src/app/api/jobs/[id]/files/[name]/route.ts`, tests
- `POST /api/jobs`: validate (C6) → create the job → start the runner in the background (in-process queue, concurrency env `MAX_CONCURRENT_JOBS=3`) → `{id}`.
- Runner: consume `HarnessClient.run`, persist events, download files to `${DATA_DIR}/jobs/<id>/`, store artifacts, set status `ok|partial|failed`, record duration. 10-min timeout → failed.
- `GET /api/jobs/[id]/events`: SSE stream of stored + live events (resume with `Last-Event-ID`).
- `POST /api/jobs/[id]/revise`: `{request}` → `HarnessClient.revise(sessionId)`, new artifact version (`v2`, `v3`…).
- `GET /api/jobs/[id]/files/[name]`: serve with correct content-type; support Range requests for video.
**Acceptance:** an integration test with the mock covers create → events → done → file download → revise.

---

## [ ] C9 UI pages
**Paths:** `src/app/(pages)…`, `src/components/*`
- `/`: hero ("Your demo video, done before the deadline."), form, live counter from `getStats()`, 3-step "how it works", footer "Built on HarnessRouter".
- `/jobs/[id]`: progress stepper driven by SSE, log lines, then video player, download buttons (mp4, srt, build_log.md, script.md), revise textbox, 👍/👎 + optional quote with a "can quote" checkbox.
- `/stats`: public metrics (numbers only from DB), auto-refresh 30s.
- `/admin?token=`: table of jobs (status, duration, error), rerun button; checks `ADMIN_TOKEN`.
- Clean, fast, mobile-friendly; no heavy UI libraries.
**Acceptance:** `pnpm build` passes; a Playwright smoke test (mock mode) submits the form, sees progress, plays the video and downloads a file.

---

## [ ] C10 Dockerfile + deploy config
**Paths:** `Dockerfile`, `.dockerignore`, `railway.json` (or `fly.toml`), `src/app/api/health/route.ts`
- Base: Playwright's official image (Chromium + deps included) + ffmpeg installed; `piper` optional.
- Multi-stage build, Next.js standalone output, volume `/data`, `PORT` from env, `GET /api/health` → `{ok, db, ffmpeg, chromium}`.
**Acceptance:** `docker build` succeeds; the container runs in mock mode, `/api/health` is all-ok, and the C9 smoke test passes against the container.
