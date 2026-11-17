# Pit Crew: Claude Code entry point

You are building **Pit Crew** for The Big Hack Game hackathon (HarnessRouter, Stanford vs. Berkeley).
Pit Crew takes a hackathon project's live link (and optionally its repo) and returns:
1. a 45–90s narrated **demo video** (`demo.mp4`)
2. a **Build Log** draft (`build_log.md`) generated from the commit history

The agent work runs on **HarnessRouter**, which is required for scoring.

## Read in this order
1. `CONTEXT.md`: event, deadline, how judging works, links
2. `SPEC.md`: product, architecture, stack, API, acceptance criteria
3. `HARNESS.md`: the agent harness: instructions, tools, output contract
4. `TASKS.md`: phased task list with acceptance checks
5. `LOOP.md`: how to work autonomously until done

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
- Prefer the simplest thing that works reliably in a live demo.
