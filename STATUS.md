# STATUS

- **Deadline:** Nov 19, 2026, 11:59 AM PST. Live at https://pitcrew-production-83e5860b.up.railway.app (Railway, manual "Deploy latest commit").
- **Phase:** feature-complete for submission; tonight's work: pitch outline, GitHub-only projects, team footage, sensitive-topic guardrails.

## Pitch Room (Nov 19, live)
- **Production URL:** https://pitcrew-production-83e5860b.up.railway.app. `PITCH_ROOM_ENABLED=true` is set on Railway; commit `389369a` is deployed. The checkbox is on the form.
- **Did it work: yes.** Production job [707K-tZr](https://pitcrew-production-83e5860b.up.railway.app/jobs/707K-tZr) (Excalidraw, 60 s):
  - all 3 drafts came back (claude-haiku-5.5);
  - the judge (claude-fable-5-2) picked "customer story" at 7.8/10; the other two scored 6.8 and 6.8;
  - no draft was capped for unverified numbers;
  - "Use this one" on the data-first draft worked: the rendered script.md is that draft;
  - final result: `ok`, 63.8 s, 4/4 steps.
- **Time and token cost:**
  - Pitch Room itself took 62.5 s and 38,282 tokens (32,745 in / 5,537 out), drafts and judge combined. HarnessRouter returns tokens only, no USD.
  - The whole job took 13:30, including the review wait while I took screenshots.
  - The local e2e run (Hunt the Wumpus, footage, 60 s) took 70 s and 39,085 tokens. It came back `ok` at 62.4 s.
- **Cost note:** this is on top of the normal plan, research and judge-pass calls. Only the winner is voiced and rendered.
- **Normal (non-Pitch-Room) run after the deploy:** not done. Our own 20-videos-per-day limit (rolling 24 h, per IP) still blocked it after 30 retries over 2.5 h (last try 05:38). **To do (human):** run one normal 60 s job once the window clears, or temporarily raise `MAX_JOBS_PER_USER_PER_DAY` on Railway. The normal flow's code path is unchanged when the box is unticked, and the local suite (110 tests) passes.
- **Screenshots:** launch/demo-backup/pitch-room-review.jpg (cards with "Use this one") and pitch-room-done.jpg (finished job, "Your pick" next to "Judge's pick").
- **Limits:**
  - Drafts rewrite narration only. On-screen headlines stay from the main plan, so a picked draft can open with different words than the title card.
  - A Pitch Room job always pauses for review. With no pick, it auto-continues with the winner after 10 minutes.
  - The draft and judge models come from a fixed preference list filtered by GET /v1/harnesses/{id}/models (it lists no prices). Override with PITCH_ROOM_DRAFT_MODEL / PITCH_ROOM_JUDGE_MODEL.
- **You need to:** nothing required. To turn it off: Railway → Variables → set `PITCH_ROOM_ENABLED=false` → Deploy.

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
