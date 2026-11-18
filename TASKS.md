# TASKS (Claude Code)

Owner: **Claude Code**: harness, directing prompt, HarnessRouter integration, research verification wiring, eval, deploy checks, launch. Rendering machinery is **Codex** in `CODEX_TASKS.md`.
Priority: **P0** = required for Definition of Done; **P1** = do if time allows; **P2** = after the hackathon.
Mark `[x]` only when the acceptance check passes. Human-only items go to HUMAN_TODO.md.

## Build-order priority (applies to both task lists)
1. Reliable demo recording + zoom
2. Problem / solution / end scenes with 2 style kits
3. Diagram engine
4. More kits / layouts / transitions
5. Self-review pass

**A simpler video that always renders beats a fancy one that sometimes breaks.** At every point, the current best pipeline must still ship a video (fallback chain: Remotion → ffmpeg slideshow).

Notes on what's checked (2026-11-17):
- Scripts are .ts, not .sh (`assemble.ts`, `slideshow.ts`); same CLI contract. The ffmpeg assembler is now the emergency fallback only.
- record_flow verified on tailwindcss.com, bun.sh, news.ycombinator.com, excalidraw.com, tldraw.com, squoosh.app.
- tts: OpenAI/ElevenLabs paths are tested with mocked HTTP only; no real TTS key yet.
- build_log P1: offline version lists commit subjects verbatim, grouped by day. The narrative version comes from the agent (untested).
- Job runner + revise are implemented against HarnessRouter but only verified in mock mode.
- Budget cap: covered by unit tests and the API's 429 "High demand" message; not yet tested on the deployed app.

## Phase 0: Verify the platform (GATE, P0), target: Nov 17 evening
- [x] P0 Read UHP spec + `/v1/openapi.json`; write `docs/hr-api.md` with exact endpoints, request/response fields, streaming event types, session continuation, file/artifact retrieval. **Check:** doc cites real field names from the spec.
- [x] P0 Hello-world: `scripts/hr-smoke.ts` sends one request to `HARNESS_ID` and prints the streamed events. **Check:** runs green against the real API. Passed Nov 17 17:30 PT (claude-sonnet-5.5).
- [x] P0 Write `harnessrouter.json` from the live Harness (fetch by `HARNESS_ID`; name, base, model, instructions). **Check:** file matches `GET /v1/harnesses/{id}`.
- [x] P0 Sandbox capability probe: `curl -sI https://example.com`, `which ffmpeg`, `npx playwright --version`, Chromium launch, max runtime, return a 5MB file, **and whether the agent can web-search and fetch pages** (decides agent-side vs server-side research, C19). **Check:** results recorded in DECISIONS.md.
- [x] P0 Decide **Plan A vs. Plan B** (see SPEC) and agent- vs server-side research; record why in DECISIONS.md.

## Phase 1: Harness v2: the director (P0), target: Nov 18 morning
- [x] P0 `harness/scripts/record_flow.ts` (zoom boxes come in Codex C17).
- [x] P0 `harness/scripts/tts.ts` with provider adapter (word timings come in Codex C18).
- [x] P0 `harness/scripts/assemble.ts` (now the emergency fallback only).
- [x] P0 `harness/scripts/slideshow.ts` fallback. **Check:** works when recording is disabled.
- [ ] P0 Director instructions (HARNESS.md) applied to the Harness: fetch with ETag → update `harness/instructions.md` + `harnessrouter.json` → `PUT` with `If-Match` (412 → refetch, redo). **Check:** live `systemPrompt` equals the file.
- [ ] P0 Plan B loop: turn 1 returns `video_plan.json`; the validator's (C15) issues go back in the same session (max 2 rounds); turn 2 self-review on sampled frames returns one patch or `ship`. **Check:** one real job shows both turns in its log and ships.
- [ ] P0 Research wiring: agent-found stats (or C19 server-side stats) pass through `verify_stats.ts`; only verified stats reach the plan; `sources.md` saved. **Check:** a job with one planted fake stat ships without it and lists it as dropped in the log.
- [ ] P0 Brand extraction in `src/lib/explore.ts` (`brand: {primary, font}` from the live site) for style-kit adaptation. **Check:** correct color on 3 known sites.
- [ ] P0 End-to-end run on 3 sites returns the output contract (with `seed`, `style_kit`, `sources`). **Check:** 3 playable videos in `eval/samples/`, all passing the validator.
- [x] P1 `build_log.md` generation from a real public repo. **Check:** facts match commits.
- [ ] P1 `submission.md` from the same run (description, links, what's next with sources). **Check:** every sentence traces to an input.
- [ ] P1 Writer harness for build log + submission text (cost routing); log cost from `usage`. **Check:** numbers in BUILD_LOG.md come from responses.

## Phase 2: App (P0), target: Nov 18 midday
- [x] P0 Next.js scaffold, Tailwind, SQLite, `.env.example`, Dockerfile.
- [x] P0 Form + validation + SSRF guard + rate limits.
- [ ] P0 Job runner: call HarnessRouter (streaming), persist events, map to progress steps, store artifacts. (Real-mode planner verified through `runPipeline` via `scripts/run-local.ts`; still to run one job through the web API/runner in real mode.)
- [x] P0 `/jobs/[id]`: SSE progress, video player, downloads.
- [ ] P0 Revise flow using the same session. **Check:** "make it shorter" yields a shorter video.
- [x] P0 `/stats` public metrics + landing counter (real numbers from DB only).
- [ ] P0 Track and show **"X teams / Y finalists used Pit Crew"** in `/stats` and the submission (finalists marked in `/admin` from the official list; never guessed). (UI in Codex C9b.)
- [ ] P0 **"Made with Pit Crew"** credit on the end card of every free video. **Check:** visible in the last 2s of 3 eval videos.
- [x] P1 Feedback widget (👍/👎, quote, consent).
- [x] P1 `/admin` with rerun.
- [ ] P1 Stripe payment link for HD (1080p) + no credit, $5 (`STRIPE_PAYMENT_LINK`; manual fulfilment is fine). **Check:** paid job re-renders without the credit.

## Phase 3: Quality (P0), target: Nov 18 evening
- [ ] P0 Run eval on ≥10 real projects; log in `eval/results.md`. **Check:** ≥80% pass SPEC criteria, or fixes logged and rerun.
- [ ] P0 **Diversity:** no two eval videos share the same style kit + layout + transition sequence. **Check:** the eval script prints the sequences and asserts uniqueness.
- [ ] P0 **Truth:** 0 unverified stats across the eval set. **Check:** the eval re-runs `verify_stats` on every `sources.md` entry.
- [ ] P0 Tune the director prompt on the eval set (story quality, layout/transition choice, stat use). **Check:** before/after scores in `eval/results.md`.
- [ ] P0 Fix the top 3 failure causes found in eval.
- [ ] P1 Cost routing experiment (cheap writer harness); record the numbers.

## Phase 4: Deploy (P0), target: Nov 18 evening
- [ ] P0 Deploy to Railway with volume `/data`; health check; error page. **Check:** a public URL processes a job end-to-end.
- [x] P0 Budget cap + "high demand" state tested.

## ── FEATURE FREEZE: Nov 18, 11:59 PM PST. After this: bug fixes, polish, launch only ──

## Phase 5: Launch kit (P0)
- [ ] P0 **Concierge mode, tonight (Nov 17):** `launch/discord-post.md` offers free pitch videos in the Berkeley/Stanford Discords (a human posts it); run early requests semi-manually (operator runs `scripts/run-local.ts`, checks the video, sends the link) while the app is finished. Log each request in `launch/concierge-log.md`. **Check:** every concierge video is also recorded in the DB so `/stats` stays honest.
- [ ] P0 Dogfood: generate **our own** pitch video with Pit Crew; save to `launch/our-demo.mp4`.
- [ ] P0 `launch/submission.md`: description, live link, repo, Harness ID, demo video, traction numbers pulled from `/stats` (incl. teams/finalists). Never "first"; see COMPETITORS.md.
- [x] P0 README: what it is, architecture diagram, setup, env vars, Harness ID.
- [ ] P0 `launch/demo-day-script.md`: 3-minute live demo plan + backup recording + key numbers.
- [ ] P1 Testimonials page from consented feedback.

## P2 (after the hackathon)
- [ ] P2 GitHub Action: regenerate the pitch video on each release (nice-to-have; not the expansion story).
