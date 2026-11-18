# CODEX_TASKS

Owner: **Codex** (rendering machinery). Claude Code owns the harness, the directing prompt, HarnessRouter integration, eval and launch (TASKS.md).
Each task is self-contained: exact paths, interfaces, acceptance tests. Mark `[x]` only when its acceptance passes.

**Build-order priority** (same as TASKS.md / LOOP.md): reliable demo recording + zoom → problem/solution/end scenes with 2 style kits → diagram engine → more kits/layouts/transitions → self-review pass. **A simpler video that always renders beats a fancy one that sometimes breaks.**

Order: C0–C2 ✓ → **C17** (footage polish + zoom boxes) → **C3** (Remotion + plan schema) → **C11** (primitives) → **C15** (validator) → **C14a** (2 style kits + seed) → **C12a** (problem/solution/end layouts) → **C18** (audio + word captions) → **C19** (research verifier; can run in parallel any time) → **C16** (diagrams) → **C13** (motion + transitions) → **C12b / C14b** (remaining layouts and kits) → C9b → C10 update.
C4 (ffmpeg slideshow) stays as the emergency fallback; C5–C8 ✓.

---

## [x] C0 Repo scaffold
_Done (Claude Code, Nov 17). npm instead of pnpm (pnpm not installed); see DECISIONS.md._
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

## [x] C1 `record_flow.ts`: Playwright recorder
_Done (Claude Code, Nov 17). Extended by C17 (bounding boxes, polish)._
**Paths:** `harness/scripts/record_flow.ts`, `tests/record_flow.test.ts`, `tests/fixtures/site/`
**CLI:** `tsx harness/scripts/record_flow.ts <flow.json> <out_dir>`
- Validate the flow with the schema. Launch Chromium (headless), context with `recordVideo` at 1280×720.
- For each step: perform the action (goto/click/type with ~60ms per char delay/scroll smooth/wait), then wait `hold_ms`. Take a screenshot `out_dir/shots/<step_id>.png` after the action.
- Per-step timeout 10s. On failure: log, mark the step failed, continue.
- Write `out_dir/recording.webm` and `out_dir/timings.json`: `[{step_id, ok, start_ms, end_ms, error?}]` (relative to video start).
- Exit 0 if ≥1 step ok, else exit 2.
**Acceptance:** test serves `tests/fixtures/site/` (a 3-page static site with a button and input) on a local port; a 5-step flow produces a webm (ffprobe duration within ±1.5s of the sum of hold_ms), 5 screenshots, and correct timings; a flow with a bad selector marks that step failed and still exits 0.

---

## [x] C2 `tts.ts`: TTS adapter
_Done (Claude Code, Nov 17). Word timings are added in C18._
**Paths:** `harness/scripts/tts.ts`, `harness/scripts/tts/*.ts`, `tests/tts.test.ts`
**CLI:** `tsx harness/scripts/tts.ts <script.json> <out_dir>`; env `TTS_PROVIDER`, `TTS_API_KEY`, optional `TTS_VOICE`.
- Providers: `openai` (HTTP TTS endpoint, mp3), `elevenlabs` (HTTP, mp3), `piper` (spawn `piper` binary if on PATH), `none` (generate silence with ffmpeg; duration = words / 2.5 seconds).
- Output: `out_dir/audio/<step_id>.mp3` + `out_dir/audio/durations.json`: `[{step_id, duration_s}]` (measured with ffprobe).
- Retry provider calls 2× with backoff; on final failure fall back to `none` for that segment and record `fallback: true`.
**Acceptance:** tests mock fetch for openai/elevenlabs (return a tiny valid mp3 fixture); `none` produces correct-length silence; durations come from ffprobe.

---

## [ ] C3 Remotion project + scene renderer from the video plan
**Paths:** `remotion/index.ts`, `remotion/Root.tsx`, `remotion/PitchVideo.tsx`, `remotion/Scene.tsx`, `harness/schemas/video_plan.ts`, `harness/scripts/render_video.ts`, `tests/render_video.test.ts`, `tests/fixtures/plans/*.json`
- Add `remotion`, `@remotion/cli`, `@remotion/renderer`, `@remotion/bundler`, `@remotion/media-utils` (exact pinned versions). License notes in DECISIONS.md.
- `harness/schemas/video_plan.ts` (zod):
```ts
Section = "problem" | "solution" | "demo" | "next" | "end";
Source = { id: string; stat: string; claim_text: string; source_name: string; url: string; year: number; quote: string; verified: boolean; kind: "research" | "team-provided" };
Element =
  | { type: "text"; text: string; role: "title"|"body"|"label" }
  | { type: "kinetic_headline"; text: string; animation: TextAnim }
  | { type: "stat"; source_id: string; value: number; unit?: string; label: string }   // count-up + citation
  | { type: "icon"; name: string } | { type: "shape"; shape: "circle"|"rect"|"blob" }
  | { type: "image"; src: string; fit: "cover"|"contain" }         // screenshot from shots/
  | { type: "clip"; step_id: string; zoom: "none"|"target"|"follow"; speed?: number }
  | { type: "arrow"; from: string; to: string } | { type: "node"; id: string; label: string; icon?: string }
  | { type: "bullets"; items: string[]; animation: TextAnim }
  | { type: "device_frame"; device: "browser"|"laptop"|"phone"; child: Element }
  | { type: "diagram"; kind: DiagramKind; nodes: Node[]; edges: Edge[]; groups?: Group[] };   // C16
Scene = { id: string; section: Section; layout: LayoutId; duration_s: number; narration: string; elements: Element[];
          transition_in: TransitionId; camera?: CameraMove | null; motion?: MotionPresetId };
VideoPlan = { version: 1; seed: number; style_kit: KitId; brand: { primary: string; font?: string };
              size: { width: 1280|1920; height: 720|1080 }; fps: 30; music?: { track: string; duck_db: number } | null;
              credit: boolean; scenes: Scene[]; flow: Flow; sources: Source[] };
```
  `LayoutId`, `TransitionId`, `MotionPresetId`, `KitId`, `TextAnim`, `CameraMove`, `DiagramKind` are string-literal unions exported from the registries in C12–C16 (start with what exists; the registries grow).
- `PitchVideo` composition: sums `duration_s` into frames, renders scenes in sequence with their `transition_in` (`@remotion/transitions`), the caption track (C18) and audio (C18), then the end card (URL + "Made with Pit Crew" when `credit`).
- `render_video.ts <out_dir>`: reads `video_plan.json`, `timings.json`, `audio/`, `clips/`, `shots/` → bundles once (cache the bundle) → `renderMedia` H.264 CRF 23 + AAC → `demo.mp4`, `thumb.jpg`; prints the C0 contract with `render_mode: "remotion"`, `seed`, `style_kit`. On any throw, exit 3 so the caller falls back to C4.
- DB: add columns `jobs.problem, jobs.whats_next, jobs.style_kit, jobs.seed, jobs.is_finalist, jobs.paid` (new migration in `src/lib/db.ts`).
**Acceptance:** a fixture plan (one scene per section, solid backgrounds, no clips) renders to a 1280×720 H.264/AAC mp4 whose ffprobe duration equals the sum of scene durations ±0.2s; an invalid plan exits non-zero; render of the fixture completes in <60s on the dev machine.

---

## [ ] C11 Primitives library
**Paths:** `remotion/primitives/{TextBlock,KineticHeadline,StatCallout,Icon,Shape,Screenshot,Clip,Arrow,Node,BulletList,DeviceFrame,CaptionTrack}.tsx`, `remotion/primitives/index.ts`, `tests/primitives.test.tsx`
- Each primitive takes `{ element, kit, rng, frame-relative timing }` and reads all sizes/colors from the kit (C14); no hard-coded colors.
- `StatCallout`: animated count-up from 0 to `value` (respecting decimals and `unit`), label, and a citation line "Source: <source_name>, <year>" (or "Source: the team" for team-provided), min 18px at 720p.
- `Clip`: plays `clips/<step_id>.mp4` (C17) with `zoom: target` using the step's recorded bounding box (spring zoom in/out), `follow` tracks the cursor path.
**Acceptance:** `renderStill` of each primitive with two kits produces non-empty PNGs that differ between kits; StatCallout's final frame text contains the exact value and the citation string; a primitive given an element of another type throws a typed error.

---

## [ ] C12 Layouts per section (C12a first: problem + solution + end; C12b: the rest)
**Paths:** `remotion/layouts/{problem,solution,demo,next,end}/*.tsx`, `remotion/layouts/registry.ts`, `tests/layouts.test.tsx`
- Problem: `big-statement`, `split-before-after`, `stat-reveal`, `quote`. Solution: `flow`, `layered-architecture`, `hub-and-spoke`, `before-after`. Demo: `full-frame`, `framed-zoom`, `pip-callouts`. Next: `timeline`, `bullet-reveal`, `roadmap-cards`. End: `end-card` (URL, optional credit).
- `registry.ts`: `LAYOUTS: Record<Section, { id: LayoutId; accepts: Element["type"][]; minDuration_s: number }[]>`; `pickLayout(section, elements, rng)` returns a valid layout id among those that accept the elements (used for seeded variation and as the validator's source of truth).
**Acceptance:** each layout renders a still with fixture elements; `pickLayout` never returns a layout that rejects the given element types; the same seed → same pick, different seeds → ≥2 distinct picks across 20 seeds for each section.

---

## [ ] C13 Motion presets + transitions
**Paths:** `remotion/motion/presets.ts`, `remotion/motion/camera.ts`, `remotion/transitions/{fade,slide,wipe,zoomThrough,matchCut,whip}.tsx`, `remotion/transitions/registry.ts`, `tests/motion.test.ts`
- Presets: entrances/exits (fade-up, scale-in, slide-in-left/right, blur-in, pop), camera (spring-zoom, pan, push-in), text (word-by-word, slide-up, typewriter, highlight-sweep). Each preset is a pure function `(frame, durationFrames, energy, rng) => style` so timing can vary ±10–20% from the seed.
- Transitions: fade, slide, wipe, zoom-through, match-cut (shared element id across scenes), whip; each declares `durationFrames` per kit energy.
**Acceptance:** presets are pure (same inputs → same output); jitter stays within ±20% of base timing across 100 seeds; each transition renders a 2-scene fixture without throwing; match-cut falls back to fade when no shared element exists (and reports it).

---

## [ ] C14 Style kits + seeded variation (C14a: 2 kits; C14b: 6–8 kits)
**Paths:** `remotion/kits/{minimal-light,bold-dark,playful,editorial,technical-grid,neon}.ts`, `remotion/kits/index.ts`, `remotion/kits/brand.ts`, `harness/scripts/rng.ts`, `tests/kits.test.ts`, `tests/variety.test.ts`
- Kit = `{ id, typeScale, fonts, colors (bg, fg, accent, muted, backdrop), spacing, radius, motionEnergy: 0..1, transitions: TransitionId[], musicMood }`.
- `applyBrand(kit, { primary, font })`: swaps the accent to the brand color only if it keeps WCAG AA contrast against the kit's bg (else nudges lightness until it does); uses the brand font if it's a known web font, else the kit font.
- `rng.ts`: deterministic PRNG (`mulberry32(seed)`), helpers `pick`, `jitter(base, pct)`.
- Brand extraction lives in `src/lib/explore.ts` (Claude Code adds `brand: {primary, font}` to the digest).
**Acceptance:** each kit passes AA for fg/bg and accent/bg; `applyBrand` with a low-contrast brand color still yields AA; **`variety.test.ts` renders 3 different fixture plans (different kits/seeds) to stills + transition lists and asserts: all 3 pass the validator (C15), and every pair differs in kit or layout sequence or transition sequence**; re-rendering the same plan + seed produces identical stills (pixel hash).

---

## [ ] C15 Plan validator (guardrails)
**Paths:** `harness/validate/plan_validator.ts`, `tests/plan_validator.test.ts`
```ts
export type PlanIssue = { scene_id?: string; rule: string; message: string };
export function validatePlan(plan: unknown, ctx: { timings?: StepTiming[]; audio?: SegmentAudio[] }): { ok: boolean; issues: PlanIssue[] };
```
Rules (each with a table-driven test): schema (C3) valid · **every `stat` element references a `sources[]` entry with `verified: true`** (team-provided allowed only with `kind: "team-provided"`) · text ≥ kit minimum size (28px body / 18px citation at 720p) · captions ≤2 lines · text over a `clip`/`image` needs a backdrop · scene `duration_s` ≥ narration audio length + 0.3s · no more than 2 identical transitions in a row · WCAG AA contrast for every text/background pair (after `applyBrand`) · sections in order problem → solution → demo → (next) → end · total 60–90s · layout accepts its elements (C12 registry) · "next" scene only when its bullets have a source (form/README/issue).
Issue messages are written for the agent ("scene p1: stat 's2' has no verified source; remove it or use a verified one").
**Acceptance:** each rule has a passing and a failing fixture; a fully valid fixture returns `ok: true` with no issues.

---

## [ ] C16 Diagram engine
**Paths:** `remotion/diagram/layout.ts`, `remotion/diagram/Diagram.tsx`, `tests/diagram.test.ts`
- Input: `{ kind: "flow"|"layered"|"hub-and-spoke"|"before-after"|"timeline"; nodes: {id,label,icon?,group?}[]; edges: {from,to,label?}[]; groups?: {id,label}[] }` + the scene narration.
- `layout.ts`: auto-layout with **elkjs** (layered/flow/timeline) or a small radial layout (hub-and-spoke); no coordinates from the agent. Fits 1280×720 with kit spacing; ≤8 nodes (else validator issue).
- Animation: each node/edge appears when the narration word that mentions its label is spoken (word timings from C18; fallback: evenly spaced); edges draw themselves (stroke-dashoffset).
**Acceptance:** layouts are deterministic for the same input; no node overlaps (bounding-box test) for 5 fixture graphs; appearance frames follow narration order; a graph with an edge to an unknown node is rejected.

---

## [x] C17 Demo-footage polish
_Done (Claude Code, Nov 17, at the user's request). Dead time is detected from loading indicators in the DOM (spinner/progress/aria-busy/skeleton), not pixel stillness alone. See DECISIONS.md. Acceptance: `tests/polish_footage.test.ts`._
**Paths:** `harness/scripts/record_flow.ts` (extend), `harness/scripts/polish_footage.ts`, `tests/polish_footage.test.ts`
- Recorder: record per step the target's bounding box (`zoom` selector, else the action selector) and the cursor path; smooth cursor (eased, 18–30 steps), human-speed typing (60–90ms/char, jittered), hold after each action. Output added to `timings.json`: `{ box?: {x,y,w,h}, cursor?: [{t,x,y}] }`.
- `polish_footage.ts <out_dir>`: cuts `recording.webm` into `clips/<step_id>.mp4`; detects dead time (frames with <0.5% pixel change for >1s, e.g. spinners/loading) and cuts or speeds it up (max 4×); writes `clips/manifest.json` `{step_id, duration_s, box, speedups[]}`.
**Acceptance:** fixture site flow → every clip exists; a fixture page with a 3s artificial spinner yields a clip ≥2s shorter than the raw window; boxes match the fixture elements' real positions ±4px.

---

## [ ] C18 Audio mixing + word-level captions
**Paths:** `harness/scripts/tts.ts` (extend), `harness/scripts/audio_mix.ts`, `remotion/primitives/CaptionTrack.tsx`, `assets/music/` (human-provided, see HUMAN_TODO), `tests/audio_mix.test.ts`
- Narration per scene (not per step). Word timings: ElevenLabs `with-timestamps` when available; otherwise estimate from character counts across the measured clip duration. Output `audio/words.json` `[{scene_id, words: [{w, start, end}]}]`.
- `audio_mix.ts`: narration track + optional music (`assets/music/<mood>/*.mp3` picked by kit `musicMood` + seed) ducked by `duck_db` under narration (sidechain or envelope from word timings), loudness normalized to −16 LUFS.
- `CaptionTrack`: ≤2 lines, current word highlighted, backdrop always on; exports `captions.srt` from the same timings.
**Acceptance:** mixed track LUFS within −16 ±1; music level during narration ≥ `duck_db`−2 dB below its level in gaps; SRT valid; caption track never exceeds 2 lines on a 40-word fixture.

---

## [ ] C19 Server-side research: search + fetch + number-match verifier
Only needed if the Phase 0 probe shows the sandbox can't search/fetch; **the verifier is needed either way** (agent-found stats are verified by our code too).
**Paths:** `src/lib/research/search.ts`, `src/lib/research/fetch_page.ts`, `src/lib/research/verify_stats.ts`, `src/lib/research/sources_md.ts`, `tests/verify_stats.test.ts`, `tests/fixtures/pages/*.html`
- `search.ts`: provider adapter (`SEARCH_PROVIDER`, `SEARCH_API_KEY`), returns `{title,url,snippet,published?}[]`; prefers .gov/.edu/major survey domains and last-3-years results (ranking only; no claims made here).
- `fetch_page.ts`: SSRF guard (`src/lib/ssrf.ts`), 10s timeout, 2MB cap, HTML → visible text (strip scripts/styles/nav), PDF text when content-type is PDF.
- `verify_stats.ts`:
```ts
export type Candidate = { stat: string; claim_text: string; source_name: string; url: string; year: number; quote: string };
export function verifyAgainstText(c: Candidate, pageText: string): { verified: boolean; reason?: string };
export async function verifyStats(cs: Candidate[]): Promise<(Candidate & { verified: boolean; reason?: string })[]>;
```
  Verified only if the **exact number and unit** from `stat` occur in the page text (normalize whitespace, thousands separators "1,200"="1200", `%`="percent", unicode minus; **no rounding, no unit conversion**) **and** the `quote` (normalized) is a substring of the page text. Year 2000–current.
- `sources_md.ts`: renders `sources.md` (stat, claim, source name, year, URL, quote, verified/team-provided).
**Acceptance:** table-driven tests: "42%" matches "42 percent" but not "4.2%" or "42.5%"; "1.2 million" does not match "1,200,000" (no conversion); a quote that isn't on the page fails; a fetched private-IP URL is refused; dropped candidates never reach `sources.md` as verified.

---

## [x] C4 `slideshow.ts`: fallback renderer (kept as the emergency fallback)
_Done (Claude Code, Nov 17). It reuses the old ffmpeg assembler (`harness/scripts/assemble.ts`, formerly C3), which now exists **only** to serve this fallback._
**Paths:** `harness/scripts/slideshow.ts`, `tests/slideshow.test.ts`
**CLI:** `tsx harness/scripts/slideshow.ts <out_dir> --title ... --url ...`
- Inputs: `shots/*.png`, `script.json`, `audio/`. Each screenshot is shown for its audio duration + 0.5s with a slow zoom (zoompan, ~1.0→1.06) and crossfades. Same cards, captions, encoding and outputs as C3; `render_mode: "slideshow"`.
**Acceptance:** works from synthetic PNGs + audio; same ffprobe checks as C3.

---

## [x] C5 Database layer
_Done (Claude Code, Nov 17) as one module `src/lib/db.ts` (not `src/lib/repo/*`). New columns for this spec are listed in C3/C19._
**Paths:** `src/lib/db.ts`, `src/lib/repo/*.ts`, `tests/db.test.ts`
- `better-sqlite3`, file at `${DATA_DIR}/pitcrew.db`, WAL mode, migrations on boot.
- Tables (see SPEC.md data model): `jobs`, `job_events(job_id, ts, step, message)`, `artifacts`, `feedback`, `rate_events(key, ts)`.
- Repo functions: `createJob`, `updateJob`, `appendEvent`, `listEvents(jobId, afterTs)`, `addArtifact`, `listArtifacts`, `addFeedback`, `getStats()` → `{ jobs_total, jobs_ok, unique_projects, median_duration_s, success_rate }`.
**Acceptance:** unit tests against a temp db cover all functions; `getStats` math is tested.

---

## [x] C6 Validation, SSRF guard, rate limits
_Done (Claude Code, Nov 17). Form fields `problem` and `whats_next` (≤300 chars each) are added in C9b._
**Paths:** `src/lib/validate.ts`, `src/lib/ssrf.ts`, `src/lib/ratelimit.ts`, tests
- Form schema (zod): `project_name` 1–80 chars, `live_url` http(s), `repo_url` optional, must match `https://github.com/<owner>/<repo>`, `blurb` ≤300, `contact` ≤100.
- SSRF: resolve DNS; reject private, loopback, link-local, metadata (169.254.169.254) and IPv6 equivalents; reject non-80/443 ports.
- Rate limit (SQLite-backed): global `MAX_JOBS_PER_HOUR`, per-key `MAX_JOBS_PER_USER_PER_DAY` (key = contact or IP hash).
**Acceptance:** table-driven tests, including `http://localhost`, `http://10.0.0.1`, `http://[::1]` and a hostname resolving to a private IP (mock DNS).

---

## [x] C7 Harness client interface + mock
_Done (Claude Code, Nov 17) in a different shape: Plan B `Planner` interface (`src/lib/harness/types.ts`), offline `LocalPlanner` as the mock, real UHP client in `real.ts`. Claude Code owns the harness side from here._
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

## [x] C8 Job runner + SSE
_Done (Claude Code, Nov 17); integration test `tests/app.integration.test.ts`._
**Paths:** `src/lib/runner.ts`, `src/app/api/jobs/route.ts`, `src/app/api/jobs/[id]/events/route.ts`, `src/app/api/jobs/[id]/revise/route.ts`, `src/app/api/jobs/[id]/files/[name]/route.ts`, tests
- `POST /api/jobs`: validate (C6) → create the job → start the runner in the background (in-process queue, concurrency env `MAX_CONCURRENT_JOBS=3`) → `{id}`.
- Runner: consume `HarnessClient.run`, persist events, download files to `${DATA_DIR}/jobs/<id>/`, store artifacts, set status `ok|partial|failed`, record duration. 10-min timeout → failed.
- `GET /api/jobs/[id]/events`: SSE stream of stored + live events (resume with `Last-Event-ID`).
- `POST /api/jobs/[id]/revise`: `{request}` → `HarnessClient.revise(sessionId)`, new artifact version (`v2`, `v3`…).
- `GET /api/jobs/[id]/files/[name]`: serve with correct content-type; support Range requests for video.
**Acceptance:** an integration test with the mock covers create → events → done → file download → revise.

---

## [~] C9 UI pages
_Pages done (Claude Code, Nov 17). Missing: the Playwright browser smoke test from the acceptance (an API-level integration test exists). New UI for this spec is C9b._
**Paths:** `src/app/(pages)…`, `src/components/*`
- `/`: hero ("Your demo video, done before the deadline."), form, live counter from `getStats()`, 3-step "how it works", footer "Built on HarnessRouter".
- `/jobs/[id]`: progress stepper driven by SSE, log lines, then video player, download buttons (mp4, srt, build_log.md, script.md), revise textbox, 👍/👎 + optional quote with a "can quote" checkbox.
- `/stats`: public metrics (numbers only from DB), auto-refresh 30s.
- `/admin?token=`: table of jobs (status, duration, error), rerun button; checks `ADMIN_TOKEN`.
- Clean, fast, mobile-friendly; no heavy UI libraries.
**Acceptance:** `pnpm build` passes; a Playwright smoke test (mock mode) submits the form, sees progress, plays the video and downloads a file.

---

## [~] C10 Dockerfile + deploy config
_Written (Claude Code, Nov 17); standalone server verified locally. `docker build` not yet run (no Docker daemon on the dev machine). Must add Remotion's needs (C3)._
**Paths:** `Dockerfile`, `.dockerignore`, `railway.json` (or `fly.toml`), `src/app/api/health/route.ts`
- Base: Playwright's official image (Chromium + deps included) + ffmpeg installed; `piper` optional.
- Multi-stage build, Next.js standalone output, volume `/data`, `PORT` from env, `GET /api/health` → `{ok, db, ffmpeg, chromium}`.
**Acceptance:** `docker build` succeeds; the container runs in mock mode, `/api/health` is all-ok, and the C9 smoke test passes against the container.

---

## [ ] C9b UI for the new spec
**Paths:** `src/components/JobForm.tsx`, `src/components/JobView.tsx`, `src/app/stats/page.tsx`, `src/app/admin/page.tsx`, `src/lib/validate.ts`
- Form: optional "What problem does this solve?" and "What's next?" (≤300 chars each).
- Job page: new stepper (`Opening site → Writing the pitch → Planning the demo → Directing → Recording → Voicing → Rendering → Reviewing`), downloads incl. `submission.md` and `sources.md`, style kit + seed shown small, P1 HD/no-credit button (`STRIPE_PAYMENT_LINK`).
- `/stats`: "X teams / Y finalists used Pit Crew" (finalists = `is_finalist` set in `/admin` from the official list). `/admin`: "mark finalist" toggle.
**Acceptance:** `npm run build` passes; integration test covers the two new form fields and the finalist count; Playwright smoke test (the one still missing from C9) passes in mock mode.
