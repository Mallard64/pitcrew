# Addendum: how Pit Crew uses HarnessRouter, and what our real runs show

## 1. How Pit Crew uses HarnessRouter

Every row below is called from our code (`src/lib/harness/real.ts`, `src/lib/sandbox.ts`, `scripts/hr-harness.ts`).

| HarnessRouter feature / endpoint | What Pit Crew does with it |
|---|---|
| `POST /v1/responses`, `stream: true` (SSE events) | Runs the main agent task: reads the site, repo and commits, then writes the pitch and directs the video. Users see live progress ("Agent opened /learn"). |
| `metadata.harness_id` | Our server picks the Harness. The browser never sees the key or the ID. |
| `previous_response_id` | Revisions ("make it shorter") and follow-up turns continue the same agent session instead of starting over. |
| `input_file` parts | Sends 3 keyframes per uploaded footage clip, so the agent narrates what the clip actually shows. |
| `user` field | Tags each task with the team's anonymous client key. |
| `timeout_seconds` | Caps each task (420 s for the main plan; 180 s for Pitch Room drafts). |
| `Idempotency-Key` header | A retried request can't start a second task. |
| Non-streaming `POST /v1/responses` | Pitch Room: three short text-only drafts and one judge call, read back with their token `usage`. |
| `GET /v1/harnesses/{id}/models` | Pitch Room picks three cheap draft models from different providers and a strong judge model, all from what the Harness allows. |
| `GET /v1/sessions/{id}/files` + `download_url` | Runs and records GitHub-only projects in the sandbox, then downloads the recording. Team code never runs on our server. |
| `GET /v1/harnesses/{id}` + `PUT` with `ETag` / `If-Match` | Updates the Harness instructions safely (ops script, not the app). The script resends `max_step`, `timeout_seconds` and `max_cost_usd` unchanged. We don't set budgets per request. |

We don't use cancel, background mode or polling.

## 2. Real runs

All are production jobs with the 60 s length option. Duration is our server's recorded job time (created → finished).

| Run | Video length | Duration | Result | Tokens (in / out) | Cost |
|---|---|---|---|---|---|
| Footage: Hunt the Wumpus (run 1) | 57.7 s | 6:53 | ok | not recorded | not recorded |
| GitHub repo: OmniSTEM (run 1) | 49.4 s | 3:45 | ok, but a provider 429 forced our offline planner (pitch check 4/8) | not recorded | not recorded |
| GitHub repo: DevPad (run 1) | none | under 1 s | failed: our storage was full | not recorded | not recorded |
| Live site: Excalidraw (run 1) | none | under 1 s | failed: our storage was full | not recorded | not recorded |
| Footage: Hunt the Wumpus (run 2) | none | 14:43 | failed: provider 429, then our render was killed (SIGKILL) | not recorded | not recorded |
| GitHub repo: OmniSTEM (sandbox) | 81.1 s | 11:59 | partial: over the 60 s target | not recorded | not recorded |
| GitHub repo: DevPad (sandbox) | 77.1 s | 9:13 | partial: over the 60 s target | not recorded | not recorded |
| Live site: Excalidraw | 66.2 s | 5:47 | ok | not recorded | not recorded |
| Footage: Hunt the Wumpus (rerun) | 54.9 s | 7:27 | ok | not recorded | not recorded |
| Live site + Pitch Room: Excalidraw | 63.8 s | 13:31* | ok | 32,745 / 5,537 (Pitch Room step only) | not recorded |
| Live site: JSON Crack | 57.2 s | 5:18 | ok | not recorded | not recorded |
| Live site + Pitch Room, 3 models: JSON Crack | 54.3 s | 7:00* | ok | 59,642 / 4,948 (Pitch Room step only) | not recorded |

\* Includes time the job waited at script review for a person.

Notes:
- HarnessRouter reports tokens, not dollars, and we didn't log tokens for the main agent task. The only token counts we saved are for the Pitch Room step.
- "Under 1 s" means our server refused the job at the start.

**Takeaways**
1. **A live-site video takes about 5–6 minutes** when nobody waits at review (5:47 and 5:18). Running a GitHub repo in the sandbox takes longer: 9:13 and 11:59.
2. **Most failures were on our side.** That covers 2 storage-full refusals and 1 killed render. The one HarnessRouter-side problem was provider 429s. They forced the offline fallback twice. One of those two jobs also failed when our server killed its render.
3. **We can't state a cost per video yet.** Cost is not recorded. The Pitch Room step alone used 38,282 tokens with one draft model and 64,590 with three.

## 3. Timeline (git commit times, PT)

Times are when the work was committed, not when it started.

- Nov 17, 12:53 PM: first commit (video pipeline scripts, local planner)
- Nov 17, 5:14 PM: first successful HarnessRouter call (smoke test against our live Harness)
- Nov 17, 5:37 PM: first video planned by the HarnessRouter agent, plus the sandbox probe
- Nov 17, 9:13 PM: claim checker (research stats verified against their source pages)
- Nov 18, 8:35 PM: GitHub-only projects run in the sandbox, plus team footage
- Nov 18, 8:48 PM: footage keyframes sent as `input_file`, so narration matches the clips
- Nov 19, 2:50 AM: Pitch Room shipped behind a flag (verified in production at 3:18 AM)
- Submission: not recorded in git
