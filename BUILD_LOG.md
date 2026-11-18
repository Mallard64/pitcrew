# Pit Crew: Build Log

Public log for the Best Build Log award. Short, specific, honest entries: what we built, what broke, numbers.

## Nov 17
- Picked the idea: every Big Hack Game team needs a demo video by Nov 19, so Pit Crew makes one from a live link.
- Wrote the spec, harness design and an autonomous build loop for Claude Code.

## Nov 17 (afternoon)
- Read the UHP spec. Harness is picked with `metadata.harness_id`; sessions continue with `previous_response_id`; artifacts come back as `container_file_citation` annotations. Notes in `docs/hr-api.md`.
- Built the video pipeline as tested scripts: Playwright recorder (with a visible fake cursor, since headless video has none), TTS adapter (OpenAI / ElevenLabs / Piper / silence, 2 retries then silence), and an ffmpeg assembler with title/end cards and burned-in captions.
- Problem: local ffmpeg has no `drawtext` or `subtitles` filter. Fix: render cards and caption overlays as PNGs in Chromium and overlay them. Same output everywhere.
- 20 tests passing so far (schemas, recorder against a fixture site, TTS with mocked providers, assembly in recording + slideshow mode).
- First real end-to-end run (offline planner, no TTS key): tailwindcss.com → 8/8 steps, 60.7s video, 72s wall time.
- Two bugs found only by looking at frames, not by tests: (1) title cards rendered unstyled because the font stack's double quotes closed the `style="..."` attribute early; (2) narration picked up class-name soup like "text-gray-950text-white". Fixed with single-quoted fonts and an `isProse()` filter.
- Bug: tsx/esbuild injects `__name()` into functions passed to `page.evaluate`, which crashes in the browser. Page scripts are now plain JS strings.
- Security: the SSRF test caught that `new URL()` rewrites `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, which slipped past the mapped-IPv4 check. Fixed.
- Built the web app: form with SSRF check, in-process queue, live progress over SSE (replayable from SQLite), video page with Range-request playback, revisions, feedback, public `/stats`, `/admin`.
- Bug: every job ran twice. Restart recovery re-queued the brand-new job, then the submit handler queued it again, and both runs wrote to the same folder (`moov atom not found`). Fixed by deduping queued/running jobs, plus a follow-up fix so the deduped path still starts the queue.
- Bug: the standalone build couldn't find `playwright-core/browsers.json` (file tracing misses runtime data files) and resolved `./data` inside `.next/standalone`. Fixed with explicit tracing includes and a small start wrapper.
- Baseline eval, offline planner, no TTS: 2/6 public sites pass every automated check (Tailwind CSS 60s, Bun 86s). The 4 misses are app-style sites with little copy (24–35s videos). That's the job for the HarnessRouter agent, which isn't connected yet (no key).

## Nov 17 (evening): repositioning
- Competitor scan: URL-to-demo-video already exists (MakeMyDemo, DemoMotion AI, Slideshot, ClickCast, DemoFlow AI, Replix, Spotlight, plus hackathon projects DemoPilot and DemoMaster), and so do auto-updating videos (Clueso, ScreenCI, Specreel, DemoGenie). So we're not "first", and a click-through recording isn't enough.
- New angle: "Others record a walkthrough. Pit Crew makes your pitch." Problem → solution → demo → what's next, plus build log and submission text from one run.
- Plan: move rendering from ffmpeg to Remotion with an agent-directed video plan (style kits, layouts, transitions, seeded variation) and a validator. Statistics only with a fetched source and an exact number match in code.
- Found and fixed a config bug: the HarnessRouter base URL in `.env` pointed at TokenRouter.
- Docs and task lists updated; nothing built for this yet.

## Nov 17 (night): HarnessRouter live
- Three different failures before the first green call: (1) `.env` sent our HarnessRouter key to TokenRouter's URL, which gave 401; (2) the TokenRouter account behind HarnessRouter had $0.00 of credit, which gave 403 on every model; (3) a new TokenRouter key had been added to `.env` but not to HarnessRouter's bring-your-own-key settings. All three were config problems, not code.
- Kept the existing Harness (so the ID already in use stays) and updated it the safe way: fetch with ETag, full PUT with If-Match, re-read. Model is now claude-sonnet-5.5, with Pit Crew instructions.
- The sandbox probe got refused with `role_mismatch`, which is the guardrail working. Rephrased as an in-scope pre-flight check: web + Chromium OK, no ffmpeg, no root, no search tool. That confirms Plan B (we render), and statistics research moves server-side.
- First real agent-planned video: tailwindcss.com, 8/8 steps, 66.9s, 141s end to end. The agent checked each element in its own browser before using it.

## Nov 17 (late): demo footage polish (C17)
- Recorder: eased cursor moves (18–30 points), human-speed typing (60–90ms/char, jittered), and per step the target's bounding box, the cursor path, and how long a loading spinner was visible.
- New `polish_footage.ts` cuts one clip per step and speeds loading up 4×. On the fixture, a 3s spinner step went from about 6s to about 4s, and zoom boxes match the real element within 4px.
- Bug caught by the test: the loading window was first timed from when we *started checking*, after the network-idle wait, so 0.7s of spinner was missed (1.89s saved against a 2s target). It's now timed from the moment the page painted.
- 55 tests passing.
