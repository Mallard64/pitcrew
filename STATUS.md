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

## Our demo video (launch/our-demo.mp4, 2:42, 1080p60, H.264 + AAC)
Path B: Pit Crew didn't make this video by itself, so the video says "Rendered with Pit Crew's own video engine", not "made by Pit Crew".
- **What's real:** every product shot is a screen recording of the live site from tonight:
  - a real Excalidraw job (form → agent → script review with one edit → finished video)
  - the OmniSTEM, DevPad and Wumpus job pages playing their generated videos
  - the pitch videos' own audio is mixed under their playback, in sync
- **What's edited:** the ~6.6 min agent wait is sped up ×44 and labeled. The narration, captions, diagram and title cards were rendered by Pit Crew's renderer (Blueprint look, Sarah voice) from a hand-written plan (`scripts/build-our-demo.ts`).
- **No stats, no user claims:** the test runs are labeled as ours.
- **Files:** narration in launch/our-demo-script.md, captions in launch/our-demo.srt, sources in launch/our-demo-sources.md.

## What I (the human) need to do
- Watch launch/our-demo.mp4 once with sound.
- Upload it to YouTube as **Unlisted**: Create → Upload video → pick the file → Visibility: Unlisted → Publish → copy the link. (Or Loom: New video → Upload a video.) Optionally add launch/our-demo.srt as subtitles.
- Paste the link into the project page's **Demo video** field and submit before **Nov 19, 11:59 AM PST**.
- Optional: grow the Railway volume (Settings → Volume) if real traffic comes in.

## GitHub-only eval (Nov 18 night)
See eval/results.md and eval/github-only/.
