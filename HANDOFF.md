# Pit Crew: handoff pack

Drop these files into an empty repo and start Claude Code there.

## Start
**Interactive (recommended first hour):**
```
claude
> Read CLAUDE.md and run LOOP.md until a stop condition is met.
```
**Unattended:** `chmod +x run-loop.sh && ./run-loop.sh 60` (read the safety note in the script first).

## Files
| File | Purpose |
|---|---|
| CLAUDE.md | Entry point; Claude Code loads this automatically |
| CONTEXT.md | Event, deadlines, judging, all links |
| SPEC.md | Product, architecture, API, acceptance criteria, Definition of Done |
| HARNESS.md | HarnessRouter harness design: prompt, tools, flow JSON, output contract |
| TASKS.md | Phased checklist with checks |
| LOOP.md | Autonomous loop + stop conditions |
| STATUS.md / DECISIONS.md / BUILD_LOG.md | State Claude maintains |
| HUMAN_TODO.md | **Do the "Before starting" items first** (keys, Harness ID, team) |
| run-loop.sh | Headless runner |
