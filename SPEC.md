# SPEC: Pit Crew

## One-liner
Paste your hackathon project's link and get a narrated **pitch video**, a Build Log draft and your submission text in minutes.
**Others record a walkthrough. Pit Crew makes your pitch.** (Competitors: `COMPETITORS.md`. Never claim "first".)

## Users
- **Primary (this week):** Big Hack Game teams who need a demo video by Nov 19, 11:59 AM PST.
- **Later:** pitch videos for every launch: hackathons, Product Hunt, YC demo days, investor updates.
- **P2 nice-to-have:** regenerate videos automatically on each release (GitHub Action). Not the expansion story.

## User flow
1. Landing page → form: project name, live URL (required), public GitHub repo URL (optional), 1–2 sentence "what it does" (optional), **"What problem does this solve?" (optional)**, **"What's next?" (optional)**, email/Discord handle (optional).
2. Submit → job page with live progress (streamed): `Opening site → Writing the pitch → Planning the demo → Directing → Recording → Voicing → Rendering → Reviewing → Done`.
3. Results: inline video player, download `demo.mp4`, `captions.srt`, `build_log.md`, `submission.md`, `sources.md`, `script.md`.
4. "Revise" box: free-text edit ("shorter", "focus on the dashboard", "more energetic") → reruns in the **same HarnessRouter session**.
5. Optional 1-click feedback: 👍/👎 + "Can we quote you?" (feeds testimonials).
6. Free videos carry a small "Made with Pit Crew" end-card credit. P1: a $5 Stripe payment link for HD (1080p) without the credit.

## Video structure (total 60–90s, flexible timing)
| # | Section | Target | Content | Sources |
|---|---|---|---|---|
| 1 | **Problem** | ~10–15s | Who hurts and why, with one concrete example and 1–3 **verified** statistics (stat callout + on-screen citation). Text + motion graphics, or a "before" screenshot. Project name appears within the first 5s. | Form "problem" field, README, site copy, verified stats |
| 2 | **Solution explained** | ~10–15s | What it is in one sentence + an animated "how it works" diagram. | Site, README, blurb |
| 3 | **Demo** | ~30–45s | Real recording of the core flow, ending on the wow moment. | Live site |
| 4 | **What's next** | ~8–12s | 2–3 roadmap bullets, optionally one verified market-size stat. **Omit the section if there is no real source; never invent roadmap items.** | Form "what's next" field, README roadmap, open issues, verified stats |
| – | **End card** | ~2–3s | URL + small "Made with Pit Crew" credit (removed in the paid version). | – |

## Architecture

```
Browser ──► Next.js app (Railway) ──► HarnessRouter /v1/responses (Harness ID in .env, never from the browser)
               │   ▲                         │
               │   └── SSE progress ◄────────┘ streaming events
               ▼
           SQLite (jobs, events, artifacts, feedback)   files in /data/jobs/<id>/v<n>/
```

### Plan B (current): the agent directs, our server renders
1. Server: SSRF check → explore the site (digest + brand color/font) → fetch README, commits, issues (public GitHub, read-only).
   **Research:** find 1–3 statistics for the Problem section (optionally market size for What's next) and verify each one (see Statistics below). Whether the agent or the server searches depends on the Phase 0 probe; either way only verified stats reach the plan.
2. Agent (HarnessRouter, turn 1): write the 4-section pitch story → plan the demo flow (with zoom targets) → choose style kit, layouts, transitions → return **`video_plan.json`** (+ build log + submission text).
3. Server: validate the plan (zod + rules; on failure send the errors back in the same session, max 2 rounds) → record the demo flow (bounding boxes per step) → TTS (word timings) → **Remotion** render → sample frames.
4. Agent (turn 2, `previous_response_id`): self-review the sampled frames against the checklist → return one plan patch for the worst issue (or "ship").
5. Server: apply the patch, re-render once, ship. Emergency fallback at any render failure: the ffmpeg slideshow (C4).

### Plan A (if the Phase 0 probe shows the sandbox can do it)
The agent runs the same scripts (record, TTS, Remotion render) in its sandbox and returns files. The video-plan contract is identical, so the decision only moves where the mechanics run. Decide in Phase 0 and record it in DECISIONS.md.

## Statistics (research + verification)
- **Research step before the story:** 1–3 relevant statistics for the Problem section (optionally market size for What's next). Prefer government, academic and major survey/industry sources from the last 3 years.
- **Hard rule:** a statistic may appear in the video only if its source page was fetched **and a code check confirms the exact number (and unit) appears in the page text**. Stored as `{stat, claim_text, source_name, url, year, quote, verified: true}`. Unverified → dropped. Never estimate, combine or round into a new claim.
- Every stat scene shows an on-screen citation: small "Source: <name>, <year>". The *stat callout* primitive animates a count-up plus that citation line.
- The project's own metrics (users, stars, results) come only from the form/README/site and are flagged `team-provided` (citation reads "Source: the team").
- `sources.md` (every stat with URL + quote) is a download and part of the output contract.
- The plan validator rejects any plan with a stat that lacks a verified source entry.
- Phase 0 tests whether the HarnessRouter sandbox can web-search and fetch. If not, research runs server-side (CODEX_TASKS C19: search + fetch + number-match verifier) and verified stats are passed into the agent input. The agent can only pick from them.

## Rendering: Remotion, agent-directed, not deterministic
- **Remotion** (React → mp4) replaces the ffmpeg assembler. The ffmpeg slideshow stays only as an emergency fallback. License notes are in DECISIONS.md.
- The agent outputs a **video plan** (scenes, timing, narration per scene, layout, motion, transitions, style). Rendering code turns it into video. **The agent never writes raw SVG/CSS.**
- **Design vocabulary, not fixed templates:**
  - *Primitives:* text block, kinetic headline, stat callout, icon/shape, image/screenshot, screen-recording clip, arrow/connector, node, bullet list, device frame, caption track.
  - *Layouts per section:* problem: big-statement, split before/after, stat-reveal, quote · solution: flow, layered architecture, hub-and-spoke, before→after · demo: full-frame, framed with zoom, picture-in-picture with callouts · next: timeline, bullet reveal, roadmap cards.
  - *Motion presets:* several entrance/exit animations; camera moves (spring zoom, pan, push-in); text animations (word-by-word, slide-up, typewriter, highlight sweep).
  - *Transitions:* fade, slide, wipe, zoom-through, match-cut on a shared element, whip. The agent picks per cut to fit content and pacing.
  - *Style kits (6–8):* e.g. minimal-light, bold-dark, playful, editorial, technical/grid, neon. Each defines type scale, spacing, motion energy and transition set. The agent picks a kit from the product's vibe and brand, then adapts it with the brand color/font extracted from the live site.
  - *Seeded variation:* every render records a `seed` in the plan. Small variations (layout choice among valid options, motion timing ±10–20%, accent placement) come from the seed, so two projects never look identical but any video is reproducible.
- **Guardrails (plan validator, zod + rules):** reject any stat without a verified source entry, text below the minimum size, more than 2 caption lines, text over busy footage without a backdrop, a scene shorter than its narration, more than 2 transitions of the same type in a row, contrast below WCAG AA. On failure the agent revises the plan.
- **Diagrams:** the agent outputs nodes/edges/groups + a kind (flow, layered architecture, hub-and-spoke, before/after, timeline). Auto-layout with elkjs or dagre (no hand-placed coordinates). Nodes and edges animate in, synced to the narration sentence that mentions them; edges draw themselves.
- **Demo footage polish:** smooth cursor movement, human-speed typing, holds after actions, auto-zoom to the target element's bounding box (recorded per step), spinners/dead time cut or sped up.
- **Audio:** natural TTS voice; optional royalty-free background music matched to the style kit, ducked under narration; burned-in captions with word highlighting (`.srt` also exported).
- **Self-review:** after rendering, the agent checks sampled frames (≥1 per scene + each transition) against: narration matches screen, readable text, no dead air, no layout overlap, brand consistent. It fixes the worst issue once, then ships.

### Video plan (contract between directing and rendering; full schema in CODEX_TASKS C3)
```json
{
  "version": 1, "seed": 482913, "style_kit": "bold-dark",
  "brand": { "primary": "#4f46e5", "font": "Inter" },
  "size": { "width": 1280, "height": 720 }, "fps": 30,
  "music": { "track": "kit-default", "duck_db": -14 },
  "scenes": [
    { "id": "p1", "section": "problem", "layout": "stat-reveal", "duration_s": 12,
      "narration": "...", "elements": [ { "type": "stat", "source_id": "src1", "value": 6, "unit": "hours", "label": "..." } ],
      "transition_in": "fade", "camera": null },
    { "id": "d1", "section": "demo", "layout": "framed-zoom", "duration_s": 9,
      "narration": "...", "elements": [ { "type": "clip", "step_id": "s3", "zoom": "target" } ],
      "transition_in": "zoom-through" }
  ],
  "flow": { "...": "demo click-flow, same Flow schema as before plus zoom targets" },
  "sources": [ { "id": "src1", "stat": "6 hours", "claim_text": "...", "source_name": "...", "url": "https://...",
                 "year": 2025, "quote": "exact sentence containing the number", "verified": true, "kind": "research|team-provided" } ]
}
```

## Stack
- Next.js (App Router, TypeScript), Tailwind. One repo, one deployment.
- Deploy: **Railway** (Docker, persistent volume at `/data`, long-running requests OK). Alternatives: Fly.io, Render.
- DB: SQLite via `better-sqlite3` on `/data/pitcrew.db`.
- Video: Playwright (Chromium) for recording, **Remotion** for rendering (H.264 + AAC), elkjs or dagre for diagram layout, ffmpeg for the emergency slideshow and audio utilities.
- TTS: whichever key the human provides (OpenAI TTS or ElevenLabs; ElevenLabs returns word timings). Fallback: Piper offline. Last resort: captions-only, no voice.

## Environment variables (`.env.example`)
```
HARNESS_MODE=mock|real
HARNESSROUTER_BASE_URL=https://api.harnessrouter.ai
HR_API_KEY=             # server only
HARNESS_ID=             # director harness (chrn_…); see harnessrouter.json
HARNESS_ID_WRITER=      # optional cheaper harness for build log + submission text (cost routing)
HARNESS_MODEL=          # optional per-task override
SEARCH_PROVIDER=        # only if research runs server-side (C19), e.g. brave|tavily|serpapi
SEARCH_API_KEY=
TTS_PROVIDER=openai|elevenlabs|piper|none
TTS_API_KEY=
ADMIN_TOKEN=            # protects /admin
MAX_JOBS_PER_HOUR=30    # global
MAX_JOBS_PER_USER_PER_DAY=5
MAX_JOBS_PER_DAY=200    # global budget cap
DATA_DIR=/data
STRIPE_PAYMENT_LINK=    # P1: HD / no-credit upgrade
```

## HarnessRouter calls (UHP; verified field names in docs/hr-api.md)
- `POST /v1/responses` with `metadata.harness_id`, `stream: true`, `user` (opaque per-visitor id), `Idempotency-Key`, `UHP-Version`.
- Standing instructions live in the Harness (`harnessrouter.json` keeps a copy), not in each task.
- Revisions and the self-review turn: `previous_response_id` (same session). New jobs: new task.
- Save each task's response id and `metadata.session_id` on the job.

## Data model
- `jobs(id, created_at, project_name, live_url, repo_url, blurb, problem, whats_next, contact, status, session_id, hr_session_id, error, duration_ms, style_kit, seed, render_mode, is_finalist, paid)`
- `artifacts(job_id, version, kind[video|srt|build_log|submission|sources|script|video_plan|thumb], path, bytes)`
- `stats_sources(job_id, version, id, stat, claim_text, source_name, url, year, quote, kind, verified)`
- `feedback(job_id, rating, quote, can_quote, created_at)`

## Pages
- `/`: landing + form + live counter ("N pitch videos made for M teams")
- `/jobs/[id]`: progress + results + revise + feedback (+ HD upgrade link, P1)
- `/stats`: public metrics (videos, teams, **finalists who used Pit Crew**, success rate, median time). Finalists are marked by an admin from the official finalist list, never guessed.
- `/admin?token=`: job list, errors, rerun, mark finalist

## Guardrails
- Public http(s) URLs only. Reject localhost/private IPs (SSRF), also for every browser request.
- No logins: the agent never enters credentials. If the site is login-walled, record the public pages and say so.
- Per-job timeout: 10 min. Rate limits from env. Global daily budget cap; when hit, show a "high demand" message.
- Repos: public GitHub only, read commits/README/issues only. Never execute repo code.
- Never invent problem statements, stats or roadmap items: every claim traces to the form, site, README, commits, issues or a verified source page.
- Stats: fetched page + exact number/unit match in code, or the stat is dropped. Fetches for research go through the same SSRF guard.

## Output acceptance criteria (a job is "good")
- `demo.mp4`: **60–90s**, 1280×720 (1080p for paid), H.264 + AAC, plays in Chrome/Safari.
- Sections in order: problem → solution → demo → (what's next, only with a real source) → end card with URL + "Made with Pit Crew" (free tier).
- Demo section shows ≥3 distinct screens/features, with zoom on the action targets.
- The plan passes the validator; narration matches what's on screen; no dead air >3s; captions present (`.srt` and burned-in with word highlighting).
- `video_plan.json` saved with its `seed` and `style_kit` (re-rendering it reproduces the video).
- `build_log.md`: dated entries from commits (what was built, key decisions, problems hit, next), ≤600 words, no invented facts.
- `submission.md`: description + links + "what's next", only facts from the sources.
- `sources.md`: every stat with URL + quote; **0 unverified stats** in the video.
- End-to-end time ≤6 min median.

## Definition of Done (whole project)
- Deployed at a public URL; P0 tasks in TASKS.md all checked.
- ≥10 real external projects processed with ≥80% "good" outputs (per criteria above), measured honestly in `/stats`, **no two eval videos share the same style kit + layout + transition sequence**, and **0 unverified stats across the eval set**.
- Our own submission video was made with Pit Crew (dogfooding).
- README with setup, architecture diagram and the Harness ID.
- HUMAN_TODO.md lists exactly what remains for humans (posting, submitting).

## Update 2026-11-18 (night): outline, GitHub-only projects, footage, sensitive topics
This section supersedes the 4-part structure and the 60–90 s length above.
- **Outline:**
  - Order: problem → solution + demo → evidence → how it's built → next steps → the ask → end card. Sections without true content are omitted, never padded.
  - Length: 90–120 s by default, or the team's pick (presets 60 s / 2 min / 3 min, slider 30 s–3 min).
  - Evidence comes only from the form's Evidence field or the repo's public GitHub signals, with the source on screen.
  - "How it's built" is a diagram from manifests, the README and the form's "Built with / why".
  - The ask comes from the form, or defaults to "Try it at <link>".
- **Form:** the live URL is optional when a public GitHub repo is given. New optional fields: Evidence, Built with / why, Your ask, and a footage upload (MP4/MOV, ≤ 500 MB, ≤ 3 min).
- **Demo modes**, recorded in the output contract (`demo_mode`) and shown on the job page:
  - `live`: as before.
  - `footage`: the team's upload.
  - `sandbox-run`: web repos run and recorded inside the HarnessRouter sandbox. Repo code never runs on our server.
  - `repo-showcase`: README images, code panels and the diagram, labeled "From the repository".
  - `cli-run`: not implemented yet; CLI repos fall back to repo-showcase.
- **Games** (Unity/Unreal/Godot): never built from source. Order: playable web link → uploaded footage → repo-showcase, plus a note asking for a 30 s gameplay upload.
- **Sensitive topics** (mental health, health, finance, legal, children):
  - A small on-screen disclaimer.
  - No treat/diagnose/cure/replace-a-professional claims, and no outcome claims without a team-cited source.
  - The plan validator enforces this: one agent rewrite, then offending lines are removed.
- **Review:** the storyboard review lists every outline section so the team can edit each one before rendering.
