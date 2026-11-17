# DECISIONS (append-only)

Format: `YYYY-MM-DD HH:MM PT, decision, why, alternatives considered`

- 2026-11-17, Product = Pit Crew (live link → demo video + build log). Why: every hackathon team needs a demo video by the same deadline, so users are reachable this week. Alternatives: Consensus PR, Rivalry Arcade, lecture → practice exam.
- 2026-11-17, Live URL is required, repo is optional. Why: running arbitrary repos is unreliable.
- 2026-11-17 12:55 PT, Repo uses npm, not pnpm. Why: pnpm isn't installed; npm works the same for one package. Alternatives: corepack pnpm.
- 2026-11-17 12:55 PT, **Plan B (hybrid), provisional.** The agent plans (flow JSON + narration + build log); our server records, voices and assembles. Why: no API key yet, so the sandbox probe can't run. The UHP docs say the runner image has ffmpeg + Playwright, so Plan A may be possible, but B keeps the video pipeline under our control and testable, and every job still goes through the Harness ID. Revisit after the probe. Alternatives: Plan A (all in sandbox).
- 2026-11-17 12:55 PT, Captions and title/end cards are rendered as PNGs with Chromium and overlaid with ffmpeg. Why: Homebrew ffmpeg 8.1 has no `drawtext`/`subtitles` (no libass/freetype); Chromium gives identical output locally and in Docker. Alternatives: ffmpeg drawtext/subtitles (needs specific builds).
- 2026-11-17 12:55 PT, Added an LLM-free local planner (site digest → flow). Why: the app must work end to end before keys arrive, and it is the fallback when the agent returns an invalid plan. Narration only restates the site's own copy or the user's blurb, so it can't invent features.
- 2026-11-17 12:55 PT, Failed steps are dropped from the cut, and narration longer than a step holds the last frame. Why: reliability over polish (LOOP quality bar).
- 2026-11-17 13:35 PT, Kept the per-job SSE stream as an optimisation; SQLite events are the source of truth (`Last-Event-ID` / `?after=` replay). Why: the UHP spec makes the same recommendation, and it survives reconnects and restarts.
- 2026-11-17 13:35 PT, One run per job at a time (dedupe in the runner). Why: a recovery path double-queued a job; two runs writing the same folder corrupted the video.
- 2026-11-17 13:35 PT, Duration outside 45–90s marks a job `partial`, not `ok`, and the UI shows why. Why: /stats must be honest; "videos made" counts ok+partial, "jobs_ok" counts only full passes.
- 2026-11-17 13:35 PT, The offline planner can narrate README prose when a repo is given. Why: app-style sites have little on-page copy; the README is the team's own words, so nothing is invented.
