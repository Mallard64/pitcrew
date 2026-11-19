# STATUS

- **Deadline:** Nov 19, 2026, 11:59 AM PST. Live at https://pitcrew-production-83e5860b.up.railway.app (Railway, manual "Deploy latest commit").
- **Phase:** feature-complete for submission; tonight's work: pitch outline, GitHub-only projects, team footage, sensitive-topic guardrails.

## Works now (verified)
- **Live-URL jobs:** the real agent on HarnessRouter plans, the demo is recorded in Chromium, voiced (ElevenLabs, 10 voices) and rendered with Remotion at 1080p60. In the wide test, 7 of 8 production jobs came back ok (Excalidraw, Hoppscotch, Carbon, Mermaid, Squoosh after the step repair, JSON Crack); shadcn/ui came back partial with a screenshot demo.
- **Pitch outline:** problem → solution → demo → evidence → how it's built → next → ask. Empty sections are omitted. The default length is 90–120 s, with presets 60 s / 2 min / 3 min.
- **GitHub-only projects:** the live URL is optional when a public repo is given. The demo mode is chosen automatically and shown on the job page:
  - `sandbox-run`: the repo runs inside the HarnessRouter sandbox (Phase 0 verified clone/install/start/record/download).
  - `repo-showcase`: README images, code panels, architecture diagram.
  - `footage`: an uploaded MP4/MOV.
  - Games never build the engine.
- **Footage:** the agent sees 3 keyframes per clip (input_file) and narrates what's on screen.
- **Sensitive topics:** detection, an on-screen disclaimer, a validator (one agent rewrite, then scrub). Unit-tested with a synthetic mental-health plan.
- **Reliability:**
  - Step repair from the page's real elements, then re-record.
  - Low-memory polish path.
  - A screenshot fallback instead of a blank demo.
  - Disk guard and pruning.
  - One retry when the model provider rate-limits.
- **Checks:** 105 tests pass; lint and build are clean.

## Doesn't work / limits
- **cli-run** (terminal recording) is not built; CLI repos get repo-showcase. The game-binary xvfb recording is not built.
- **Storage:** the Railway volume is only 434 MB. Each finished job keeps ~10–35 MB, so plan to grow it or prune old jobs regularly. Test-job files were deleted on Nov 18 to free space (job rows remain).
- **Provider rate limits:** the model provider behind TokenRouter returned 429 during one eval run. The job falls back to the offline planner (weaker video) after one retry.
- **Clip polish on ui.shadcn.com** was SIGKILLed twice on Railway (cause unknown); the job degrades to screenshots and reports partial.
- **Real users:** no real-user feedback yet. /stats only counts our own test runs.

## What I (the human) need to do
- Submit: upload the demo video as YouTube unlisted or Loom, and paste the link into the project page's "Demo video" field.
- Optional: grow the Railway volume (Settings → Volume) if real traffic comes in.

## GitHub-only eval (Nov 18 night)
See eval/results.md and eval/github-only/.
