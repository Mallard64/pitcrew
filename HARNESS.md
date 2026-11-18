# HARNESS: the Pit Crew agent

The harness configured in HarnessRouter. Its ID is `HARNESS_ID` in `.env` (server only, never from the browser); a copy of its config lives in `harnessrouter.json`.
A harness = base agent + instructions + model + tools/skills + permissions + output contract.
Standing instructions are stored **in the Harness** (`system_prompt`), not sent with each task. To change them: fetch the Harness by id (keep the ETag) → update `harnessrouter.json` + `harness/instructions.md` → `PUT` with `If-Match` → on 412, fetch again and redo.

## Harnesses (multi-harness cost routing)
| Role | Env | Base + model | Job |
|---|---|---|---|
| **Director** (exists) | `HARNESS_ID` | `claude-code` + `claude-sonnet-5.5` (guide's pick for strict-JSON output; claude-code passed HarnessRouter's browser test) | Pitch story, demo flow, directing (video plan), self-review |
| **Writer** (optional, P1) | `HARNESS_ID_WRITER` | a cheaper pairing from the guide's table | `build_log.md` + `submission.md` from commits/README/issues |
Log the cost difference per job in BUILD_LOG.md once both run (numbers from HarnessRouter `usage`, never estimated).

## Tools/skills the harness needs
| Need | Plan A (in sandbox) | Plan B (our server, current) |
|---|---|---|
| Browse + verify selectors | Playwright + Chromium | agent's own browser tool + our site digest |
| Record demo + bounding boxes | `record_flow.ts` | ours |
| Git history, README, issues | GitHub API (public) | ours (passed in the task input) |
| Web search + fetch for stats | agent, if the Phase 0 probe confirms it | ours (C19); verified stats passed in |
| Stat verification (exact number + unit in page text) | always our code (`verify_stats.ts`); the agent's word is never enough | same |
| TTS with word timings | HTTP call to provider | ours |
| Render | Remotion (`render_video.ts`) | ours |
| Frame sampling for self-review | ffmpeg | ours → frames sent as `input_image` in the follow-up turn |

## Pipeline (one job)
1. **Understand.** Read the site digest (headings, copy, pages, inputs, brand color/font) and open the live URL (max 8 page loads). Read README, last 200 commits and open issues if a repo is given, plus the form's blurb / problem / what's-next fields. Write a 3-sentence summary: who it's for, the problem, the wow moment.
2. **Research.** Find 1–3 statistics for the Problem (optionally market size for What's next), preferring government, academic and major survey/industry sources from the last 3 years. For each: fetch the page and copy the exact sentence containing the number as `quote`. Return them as `sources[]`; our code checks the number + unit appear in the fetched page text and drops any that don't. In server-side mode you instead receive `verified_stats[]` and may only use those.
3. **Write the pitch story (4 sections).** Problem (~10–15s: who hurts, one concrete example, 1–3 verified stats with on-screen citation) → Solution (~10–15s: one sentence + how-it-works diagram as nodes/edges) → Demo (~30–45s: the core flow ending on the wow moment) → What's next (~8–12s: 2–3 bullets, **only from the form, README or issues; omit the section if there is no source**). Total 60–90s.
4. **Plan the demo flow** (Flow JSON, 4–8 steps) with a **zoom target per step** (the selector whose bounding box the camera zooms to). Only selectors verified on the live page. Never log in, pay, or enter personal data; fake demo inputs only.
5. **Direct.** Choose a style kit from the product's vibe + brand, then a layout per scene, motion presets, camera moves and a transition per cut. Vary choices; don't default to the same layout every time. Use only names from the vocabulary in SPEC.md.
6. **Output the video plan** (`video_plan.json`, schema in CODEX_TASKS C3) with `sources[]` + `build_log.md` + `submission.md`. Every stat element references a source id. The project's own metrics are `kind: "team-provided"` (from form/README/site only). Never raw SVG/CSS.
7. **Record → render** (server in Plan B; you in Plan A). If the validator rejects the plan, you get the errors in the same session: fix exactly those and resend (max 2 rounds).
8. **Self-review.** You receive sampled frames (≥1 per scene + each transition). Check: narration matches screen, text readable, no dead air, no overlap, brand consistent. Return one plan patch for the **worst** issue, or `ship`.
9. **Fix once**, then return the output contract.

## Flow JSON (demo section; unchanged contract + zoom targets)
```json
{
  "project_name": "string", "url": "https://...", "viewport": {"width": 1280, "height": 720},
  "steps": [
    {"id": "s1", "action": "goto", "url": "https://...", "hold_ms": 2500, "say": "...", "zoom": null},
    {"id": "s2", "action": "click", "selector": "text=Get started", "hold_ms": 2000, "say": "...", "zoom": "text=Get started"},
    {"id": "s3", "action": "type", "selector": "input[name=q]", "text": "demo query", "hold_ms": 3000, "say": "...", "zoom": "input[name=q]"}
  ]
}
```
Rules: each `say` ≤ 25 words; `hold_ms` ≥ estimated speech time; demo section 30–45s.

## Agent instructions (system prompt; applied to the Harness via `harness/instructions.md`)

> You are Pit Crew, an agent that turns a hackathon project into a 60–90s **pitch video** plan, a build log and submission text. Each request comes from the Pit Crew server on behalf of one team.
> If a request is not about this, reply with the first line `role_mismatch` and one sentence on what you can do.
>
> **Inputs:** project_name, live_url, site digest (incl. brand color/font), optional repo facts (README, commits, issues), optional blurb / problem / whats_next, optional revision_request, or sampled frames for self-review.
>
> **Steps:** understand → research 1–3 stats (fetch each source; quote the exact sentence) → write the pitch story (problem, solution, demo, what's next) → plan the demo flow with zoom targets → choose a style kit + layouts + motion + transitions → output the video plan → (server records and renders) → self-review the frames → fix the worst issue once → return the output contract.
>
> **Rules:** every claim traces to the inputs or a fetched source; a stat must appear verbatim (number + unit) in its source page or it is dropped; never estimate or round into a new number; every stat scene shows "Source: <name>, <year>"; team metrics are flagged team-provided. Never invent problems, stats, users or roadmap items (omit "what's next" without a source). Plain, specific narration; no hype words ("revolutionary", "game-changing"); never claim features you didn't see. Use only vocabulary names (primitives, layouts, motions, transitions, kits). Never write SVG/CSS. No secrets, localhost, file:// or absolute paths.
>
> **Revisions:** if revision_request is present, change only what's needed and keep the seed unless asked for a new look.
>
> **Time limit:** finish within 8 minutes. Prefer a simpler plan that renders over a fancy one that might break.

## Output contract
Files: `demo.mp4`, `captions.srt`, `video_plan.json`, `sources.md`, `script.md`, `flow.json`, `thumb.jpg`, `submission.md`, and `build_log.md` if a repo was given.
Final message contains one JSON block:
```json
{"status":"ok|partial|failed","render_mode":"remotion|slideshow","duration_s":0,
 "sections":["problem","solution","demo","next"],"steps_ok":0,"steps_total":0,
 "seed":0,"style_kit":"bold-dark","self_review":{"issue":"text or null","fixed":true},
 "stats":{"used":0,"verified":0,"dropped":0},
 "notes":"what failed and why"}
```

## Eval set (Phase 3)
- 10+ real projects: other Big Hack Game teams (event Projects tab, Discords) plus public hackathon projects with live links.
- Score each against SPEC "Output acceptance criteria"; record results in `eval/results.md` (honest, including failures).
- Diversity check: **no two eval videos share the same style kit + layout + transition sequence.**
- Truth check: **0 unverified stats across the eval set** (P0). The verifier re-runs on every `sources.md` entry.
- Tune the director prompt on this set (TASKS.md P0).
