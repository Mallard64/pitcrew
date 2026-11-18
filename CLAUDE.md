# Pit Crew: Claude Code entry point

You are building **Pit Crew** for The Big Hack Game hackathon (HarnessRouter, Stanford vs. Berkeley).
Pit Crew takes a hackathon project's live link (and optionally its repo) and returns a submission kit:
1. a 60–90s narrated **pitch video** (`demo.mp4`): problem → solution → demo → what's next, agent-directed and rendered with Remotion
2. a **Build Log** draft (`build_log.md`) from the commit history
3. **submission text** (`submission.md`) and `sources.md` (every statistic with its verified source)

Positioning: **"Others record a walkthrough. Pit Crew makes your pitch."** Competitors exist (`COMPETITORS.md`). Never claim "first".

## Ownership
- **Claude Code** (this file): `TASKS.md`: harness + directing prompt, HarnessRouter integration, research verification wiring, eval, deploy checks, launch.
- **Codex** (`AGENTS.md`): `CODEX_TASKS.md`: Remotion renderer, primitives, layouts, motion, kits, validator, diagrams, footage polish, audio, research verifier.

The agent work runs on **HarnessRouter**, which is required for scoring.

## Read in this order
1. `CONTEXT.md`: event, deadline, how judging works, positioning, links
2. `COMPETITORS.md`: who else does this and how we differ
3. `SPEC.md`: product, video structure, rendering, statistics rules, architecture, acceptance criteria
4. `HARNESS.md`: the agent harness: pipeline, instructions, output contract
5. `TASKS.md`: your phased task list with acceptance checks and the build-order priority
6. `LOOP.md`: how to work autonomously until done

## State files (you maintain these)
- `STATUS.md`: current phase, last task done, next task, blockers
- `DECISIONS.md`: every non-obvious choice + why (append-only)
- `HUMAN_TODO.md`: things only a human can do (accounts, keys, posting, submitting)
- `BUILD_LOG.md`: our own public build log (this is also a prize category, so keep it good)

## Hard rules
- **Deadline: Nov 19, 2026, 11:59 AM PST.** Feature freeze at Nov 18, 11:59 PM PST.
- Never commit secrets. Use `.env` (gitignored) and `.env.example`.
- Never fake results, metrics or test passes. If something doesn't work, say so in STATUS.md.
- Verify HarnessRouter API details against its OpenAPI spec before coding against them.
  Field names in these docs are illustrative where marked.
- Prefer the simplest thing that works reliably in a live demo. A simpler video that always renders beats a fancy one that sometimes breaks.
- Statistics only with a fetched source page and an exact number + unit match in code; otherwise drop them.
- The HarnessRouter key is `HR_API_KEY` (server only). The Harness ID comes from server config, never from the browser. Instructions live in the Harness; change them with fetch → ETag → `PUT` + `If-Match`.
