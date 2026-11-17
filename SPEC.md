# SPEC: Pit Crew

## One-liner
Paste your hackathon project's link and get a narrated demo video and a Build Log draft in minutes.

## Users
- **Primary (this week):** Big Hack Game teams who need a demo video by Nov 19, 11:59 AM PST.
- **Later:** any software team that needs demo, docs or changelog videos that stay current.

## User flow
1. Landing page → form: project name, live URL (required), public GitHub repo URL (optional), 1–2 sentence "what it does" (optional), email/Discord handle (optional).
2. Submit → job page with live progress (streamed): `Opening site → Planning flow → Recording → Writing narration → Voicing → Assembling → Done`.
3. Results: inline video player, download `demo.mp4`, `captions.srt`, `build_log.md`, `script.md`.
4. "Revise" box: free-text edit ("shorter", "focus on the dashboard", "more energetic") → reruns in the **same HarnessRouter session**.
5. Optional 1-click feedback: 👍/👎 + "Can we quote you?" (feeds testimonials).

## Architecture

```
Browser ──► Next.js app (Railway) ──► HarnessRouter /v1/responses (Harness ID: pit-crew)
               │   ▲                         │
               │   └── SSE progress ◄────────┘ streaming events
               ▼
           SQLite (jobs, runs, feedback)   artifacts proxied/stored in /data
```

### Plan A (preferred): everything runs in the HarnessRouter sandbox
The harness agent opens the site with Playwright, records, writes the script, calls TTS, runs ffmpeg and returns files.

### Plan B (fallback if Phase 0 shows the sandbox can't run a browser/ffmpeg or has no egress)
Hybrid. HarnessRouter agent does the **thinking**: understand the product, plan the click-flow as JSON, write the narration and the build log.
Our server (Docker on Railway with Chromium + ffmpeg) does the **mechanics**: execute the flow JSON with Playwright, TTS, ffmpeg.
Every job still goes through the Harness ID, so usage still counts.

Decide A vs. B in Phase 0 and record it in DECISIONS.md.

## Stack
- Next.js (App Router, TypeScript), Tailwind. One repo, one deployment.
- Deploy: **Railway** (Docker, persistent volume at `/data`, long-running requests OK). Alternatives: Fly.io, Render.
- DB: SQLite via `better-sqlite3` on `/data/pitcrew.db`.
- Video (Plan B, or helper scripts shipped to the sandbox in Plan A): Playwright (Chromium), ffmpeg (H.264 `-preset veryfast -crf 23`, AAC), TTS.
- TTS: whichever key the human provides (OpenAI TTS or ElevenLabs). Fallback: Piper offline. Last resort: captions-only, no voice.

## Environment variables (`.env.example`)
```
HARNESSROUTER_BASE_URL=
HARNESSROUTER_API_KEY=
HARNESS_ID=
HARNESS_MODEL=
TTS_PROVIDER=openai|elevenlabs|piper|none
TTS_API_KEY=
ADMIN_TOKEN=            # protects /admin
MAX_JOBS_PER_HOUR=30    # global
MAX_JOBS_PER_USER_PER_DAY=5
DATA_DIR=/data
```

## HarnessRouter calls (illustrative; confirm fields against /v1/openapi.json)
```bash
curl -sS "$HARNESSROUTER_BASE_URL/v1/responses" \
  -H "Authorization: Bearer $HARNESSROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "harness_id": "'"$HARNESS_ID"'",
    "model": "'"$HARNESS_MODEL"'",
    "input": "<job prompt built from HARNESS.md + form fields>",
    "stream": true
  }'
```
- Streaming: parse events and map them to the progress steps above.
- Revisions: continue the same session (Responses-style `previous_response_id` or a UHP session id; check the spec).
- Artifacts: download the returned files and store them under `/data/jobs/<id>/`.

## Data model
- `jobs(id, created_at, project_name, live_url, repo_url, blurb, contact, status, session_id, error, duration_ms)`
- `artifacts(job_id, kind[video|srt|build_log|script|thumb], path, bytes)`
- `feedback(job_id, rating, quote, can_quote, created_at)`

## Pages
- `/`: landing + form + live counter ("N demo videos made for M teams")
- `/jobs/[id]`: progress + results + revise + feedback
- `/stats`: public metrics (jobs, unique projects, success rate, median time). This is our evidence for Distribution & Impact.
- `/admin?token=`: job list, errors, rerun button

## Guardrails
- Public http(s) URLs only. Reject localhost/private IPs (SSRF).
- No logins: the agent never enters credentials. If the site is login-walled, record the public pages and say so.
- Per-job timeout: 10 min. Rate limits from env. Global daily budget cap; when hit, show a "high demand" message.
- Repos: public GitHub only, shallow clone, read commits/README only. Never execute repo code in Plan B.

## Output acceptance criteria (a job is "good")
- `demo.mp4`: 45–90s, 1280×720, H.264 + AAC, plays in Chrome/Safari.
- Title card with project name (≈2s), end card with URL (≈2s).
- Shows ≥3 distinct screens/features of the product.
- Narration matches what's on screen; no dead air >3s; captions present (`.srt` and burned-in).
- `build_log.md`: dated entries from commits (what was built, key decisions, problems hit, next), ≤600 words, no invented facts.
- End-to-end time ≤6 min median.

## Definition of Done (whole project)
- Deployed at a public URL; P0 tasks in TASKS.md all checked.
- ≥10 real external projects processed with ≥80% "good" outputs (per criteria above), measured honestly in `/stats`.
- Our own submission demo video was made with Pit Crew (dogfooding).
- README with setup, architecture diagram and the Harness ID.
- HUMAN_TODO.md lists exactly what remains for humans (posting, submitting).
