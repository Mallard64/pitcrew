# TASKS

Priority: **P0** = required for Definition of Done; **P1** = do if time allows.
Mark `[x]` only when the acceptance check passes. Human-only items go to HUMAN_TODO.md.

Notes on what's checked (2026-11-17):
- Scripts are .ts, not .sh (`assemble.ts`, `slideshow.ts`); same CLI contract.
- record_flow verified on tailwindcss.com, bun.sh, news.ycombinator.com, excalidraw.com, tldraw.com, squoosh.app.
- tts: OpenAI/ElevenLabs paths are tested with mocked HTTP only; no real TTS key yet.
- build_log P1: offline version lists commit subjects verbatim, grouped by day (facts match commits by construction). The narrative version comes from the HarnessRouter agent (untested).
- Job runner + revise are implemented against HarnessRouter but only verified in mock mode. Offline "make it shorter" can't shorten sites that are already at the 3-step floor.
- Budget cap: covered by unit tests (`tests/db.test.ts`) and the API returns 429 with the "High demand" message; not yet tested on the deployed app.

## Phase 0: Verify the platform (GATE, P0), target: Nov 17 evening
- [x] P0 Read UHP spec + `/v1/openapi.json`; write `docs/hr-api.md` with exact endpoints, request/response fields, streaming event types, session continuation, file/artifact retrieval. **Check:** doc cites real field names from the spec.
- [ ] P0 Hello-world: script `scripts/hr-smoke.ts` sends one request to `HARNESS_ID` and prints the streamed events. **Check:** runs green against the real API.
- [ ] P0 Sandbox capability probe: ask the harness to report `curl -sI https://example.com`, `which ffmpeg`, `npx playwright --version`, whether it can install Chromium, max runtime, and to return a 5MB test file. **Check:** results recorded in DECISIONS.md.
- [ ] P0 Decide **Plan A vs. Plan B** (see SPEC) and record why in DECISIONS.md.

## Phase 1: Harness v1 (P0), target: Nov 18 morning
- [x] P0 `harness/scripts/record_flow.ts`: executes flow JSON, outputs `recording.webm`, step screenshots, `timings.json`. **Check:** works on 3 public sites.
- [x] P0 `harness/scripts/tts.ts` with provider adapter (openai/elevenlabs/piper/none). **Check:** produces audio per segment with durations.
- [x] P0 `harness/scripts/assemble.sh`: title/end cards, narration, burned captions, `captions.srt`, H.264 `-preset veryfast -crf 23`. **Check:** output meets SPEC video criteria.
- [x] P0 `harness/scripts/slideshow.sh` fallback. **Check:** works when recording is disabled.
- [ ] P0 Harness instructions from HARNESS.md configured in HarnessRouter; end-to-end run on 3 sites returns the output contract. **Check:** 3 playable videos in `eval/samples/`.
- [x] P1 `build_log.md` generation from a real public repo. **Check:** facts match commits.

## Phase 2: App (P0), target: Nov 18 midday
- [x] P0 Next.js scaffold, Tailwind, SQLite, `.env.example`, Dockerfile (Chromium + ffmpeg if Plan B).
- [x] P0 Form + validation + SSRF guard + rate limits.
- [ ] P0 Job runner: call HarnessRouter (streaming), persist events, map to progress steps, store artifacts.
- [x] P0 `/jobs/[id]`: SSE progress, video player, downloads.
- [ ] P0 Revise flow using the same session. **Check:** "make it shorter" yields a shorter video.
- [x] P0 `/stats` public metrics + landing counter (real numbers from DB only).
- [x] P1 Feedback widget (👍/👎, quote, consent).
- [x] P1 `/admin` with rerun.

## Phase 3: Quality (P0), target: Nov 18 evening
- [ ] P0 Run eval on ≥10 real projects; log in `eval/results.md`. **Check:** ≥80% pass SPEC criteria, or fixes logged and rerun.
- [ ] P0 Fix the top 3 failure causes found in eval.
- [ ] P1 Cost routing experiment (cheap model for build log); record the numbers.

## Phase 4: Deploy (P0), target: Nov 18 evening
- [ ] P0 Deploy to Railway with volume `/data`; health check; error page. **Check:** a public URL processes a job end-to-end.
- [x] P0 Budget cap + "high demand" state tested.

## ── FEATURE FREEZE: Nov 18, 11:59 PM PST. After this: bug fixes, polish, launch only ──

## Phase 5: Launch kit (P0), target: Nov 19 morning
- [ ] P0 `launch/discord-post.md`: short posts for the Berkeley and Stanford Discords (free demo videos before the deadline).
- [ ] P0 Dogfood: generate **our own** demo video with Pit Crew; save to `launch/our-demo.mp4`.
- [ ] P0 `launch/submission.md`: project description, live link, repo, Harness ID placeholder, demo video, traction numbers pulled from `/stats`.
- [x] P0 README: what it is, architecture diagram, setup, env vars, Harness ID.
- [ ] P0 `launch/demo-day-script.md`: 3-minute live demo plan + backup recording + key numbers.
- [ ] P1 Testimonials page from consented feedback.
