# Pit Crew → HarnessRouter build log posts (ranked by impact)

Ranked by developers affected × severity. Every post is evidenced in our repo (DECISIONS.md, BUILD_LOG.md, job logs in `eval/`, `scripts/hr-*.ts`). Put screenshots in `img/` before posting; the ones marked "have" are already there.

| # | Post | Type | Why it matters | Screenshots |
|---|---|---|---|---|
| 1 | [Sandbox capabilities and limits aren't documented](03-sandbox-capabilities-undocumented.md) | Docs / improvement | Every builder makes a day-1 "sandbox or my server" decision blind; the self-hosting docs claim ffmpeg, which isn't on PATH on the hosted service | have: `sandbox-omnistem-home.png`, `omnistem-sandbox-video-frames.jpg` |
| 2 | [Provider 429s surface as "your key was refused" and fail the task](02-rate-limit-reported-as-key-refused.md) | Bug (error handling) | Long agent runs are thrown away on a transient limit, and the message points at the wrong cause (2 of 9 of our production jobs) | capture: `429-job-log.png` (text in `eval/github-only/run1/omnistem/log.txt`) |
| 3 | [`input_image` parts are silently dropped](01-input-image-dropped.md) | Bug (repro included) | A silent 200 with a blind agent; it breaks any vision use, and ported Responses-style code hits it first | have: `wumpus-keyframe-sent.jpg`; capture: `input-image-response.png` |
| 4 | [An unfunded BYOK key fails every model with a bare 403](04-unfunded-byok-generic-403.md) | Onboarding / errors | Every new team's first call; we needed a direct TokenRouter call to diagnose it | capture: `byok-settings.png` (key masked) |
| 5 | [Session files list returns the whole workspace](06-session-files-no-artifact-filter.md) | Improvement (API) | File-producing agents (the main reason for a sandbox) can't find their outputs without guesswork | capture: `session-files.png` |
| 6 | [Updating a Harness needs a full PUT of every field](05-harness-update-full-put.md) | Improvement (API) | Each prompt edit in production risks resetting the model or tools; there's no PATCH or version history | capture: `harness-put-script.png` |
| 7 | [Usage has no per-step breakdown](07-token-usage-no-breakdown.md) | Improvement (observability) | Can't predict or reduce cost per task (a 154 s check took 390k input tokens) | capture: `usage-totals.png` |

**Post first today:** #3 (`input_image`; cleanest bug with exact repro steps), #2 (429 handling; real production impact with the exact error), #1 (sandbox docs; affects every builder).

**Not posted (unverified):** see [UNVERIFIED.md](UNVERIFIED.md).
