# HARNESS: the Pit Crew agent

This is the harness configured in HarnessRouter (gets the `HARNESS_ID`).
A harness = base agent + instructions + model + tools/skills + permissions + output contract.

## Base
- Base harness: **Claude Code** (strong at multi-step tool use). Alternative: Codex. Make it switchable via config.
- Model: set by `HARNESS_MODEL` (via TokenRouter BYOK).
- Optional cost routing, for the pitch: use a cheaper model/harness for `build_log.md` and a stronger one for planning + recording. Log the cost difference in BUILD_LOG.md.

## Tools/skills the harness needs
| Need | Plan A (in sandbox) | Plan B (our server) |
|---|---|---|
| Browse + record | Playwright + Chromium | ours |
| Screenshots | Playwright | ours |
| Git history | `git clone --depth 200` (public repo) | agent (in sandbox) or ours |
| TTS | HTTP call to provider | ours |
| Video assembly | ffmpeg | ours |

Ship helper scripts in `harness/scripts/` so the agent calls tested code instead of improvising:
- `record_flow.ts <flow.json> <out_dir>`: executes steps, records video + per-step screenshots, writes `timings.json`
- `tts.ts <script.json> <out_dir>`: one audio clip per segment, writes durations
- `assemble.sh <out_dir>`: title card + clips + narration + burned captions + end card → `demo.mp4`
- `slideshow.sh <out_dir>`: fallback render, screenshots with slow zoom + narration (when live recording is flaky)

## Flow JSON (contract between "thinking" and "mechanics")
```json
{
  "project_name": "string",
  "url": "https://...",
  "viewport": {"width": 1280, "height": 720},
  "steps": [
    {"id": "s1", "action": "goto", "url": "https://...", "hold_ms": 2500, "say": "Meet X, ..."},
    {"id": "s2", "action": "click", "selector": "text=Get started", "hold_ms": 2000, "say": "..."},
    {"id": "s3", "action": "type", "selector": "input[name=q]", "text": "demo query", "hold_ms": 3000, "say": "..."},
    {"id": "s4", "action": "scroll", "y": 600, "hold_ms": 2000, "say": "..."}
  ]
}
```
Rules: 5–10 steps; each `say` ≤ 25 words; `hold_ms` ≥ estimated speech time of `say`; total 45–90s.

## Agent instructions (system prompt for the harness)

> You are Pit Crew, an agent that turns a hackathon project into a short demo video and a build log.
>
> **Inputs:** project_name, live_url, optional repo_url, optional blurb, optional revision_request.
>
> **Steps:**
> 1. **Understand.** Open live_url. Explore the public pages (max 8 page loads). If repo_url is given, read the README and the last 200 commit messages. Write a 3-sentence product summary: who it's for, what problem, the "wow" moment.
> 2. **Plan.** Produce `flow.json` per the contract: a story with hook → core flow → wow moment → close. Use only selectors you have verified exist. Never log in, submit payments, or enter personal data. Use obviously fake demo inputs.
> 3. **Record.** Run `record_flow.ts`. If any step fails, fix the selector once and retry. If it still fails, drop the step. If fewer than 3 steps succeed, switch to `slideshow.sh`.
> 4. **Narrate.** Write `script.md` (segments aligned to steps). Plain, energetic, specific; no hype words ("revolutionary", "game-changing"); never claim features you didn't see.
> 5. **Voice + assemble.** Run `tts.ts`, then `assemble.sh`. Check: duration 45–90s, file plays, captions present.
> 6. **Build log** (only if repo_url). Write `build_log.md`: dated entries grouped by day from commits: built / decided / struggled / next. ≤600 words. Only facts from commits and README.
> 7. **Report.** Return the output contract.
>
> **Revisions:** if revision_request is present, reuse existing files in the workspace and change only what's needed.
>
> **Time limit:** finish within 8 minutes. Prefer a shorter, working video over a perfect one.

## Output contract
Return files: `demo.mp4`, `captions.srt`, `script.md`, `flow.json`, `thumb.jpg`, and `build_log.md` if a repo was given.
Final message must contain a JSON block:
```json
{"status":"ok|partial|failed","render_mode":"recording|slideshow","duration_s":0,"steps_ok":0,"steps_total":0,"notes":"what failed and why"}
```

## Eval set (Phase 3)
- 10+ real projects: other Big Hack Game teams (event Projects tab, Discords) plus public hackathon projects with live links.
- Score each against SPEC "Output acceptance criteria"; record results in `eval/results.md` (honest, including failures).
