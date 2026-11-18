# Pit Crew: handoff pack

Drop these files into an empty repo and start Claude Code there.

## Start
**Interactive (recommended first hour):**
```
claude
> Read CLAUDE.md and run LOOP.md until a stop condition is met.
```
**Unattended:** `chmod +x run-loop.sh && ./run-loop.sh 60` (read the safety note in the script first).
**Codex:** start Codex in this repo and say: "Read AGENTS.md and work through CODEX_TASKS.md in its Order, following LOOP.md."

## Files
| File | Purpose |
|---|---|
| CLAUDE.md | Claude Code entry point (loaded automatically); ownership split |
| AGENTS.md | Codex entry point (plus the Next.js agent notes) |
| CONTEXT.md | Event, deadlines, judging, positioning, links |
| COMPETITORS.md | Existing tools and how Pit Crew differs |
| SPEC.md | Product, video structure, rendering, statistics rules, Definition of Done |
| HARNESS.md | HarnessRouter harness: pipeline, instructions, video-plan contract |
| TASKS.md | Claude Code's phased checklist + build-order priority |
| CODEX_TASKS.md | Codex's checklist (C0–C19) |
| LOOP.md | Autonomous loop + stop conditions |
| STATUS.md / DECISIONS.md / BUILD_LOG.md | State the agents maintain |
| HUMAN_TODO.md | **Do the "Tonight" and key items first** |
| run-loop.sh | Headless runner for Claude Code |
