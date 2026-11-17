# LOOP: autonomous work protocol

Run this loop until the **Stop conditions** are met. Do not wait for a human between iterations.

## Each iteration
1. **Orient** (≤2 min): read `STATUS.md`, `TASKS.md`, the tail of `DECISIONS.md`, and check the current time against the deadlines in `CONTEXT.md`.
2. **Pick** the first unchecked task in the earliest unfinished phase that isn't blocked.
   - Phase 0 is a gate: do not start Phase 1 until the Plan A/B decision is recorded.
   - After feature freeze (Nov 18, 11:59 PM PST), only pick bug fixes, Phase 4–5 tasks and P0 quality fixes.
3. **Plan** in 3–6 bullets inside `STATUS.md` under "Current task".
4. **Do** the task. Keep changes small and focused.
5. **Verify** the task's **Check** for real: run it, open the output, play the video, hit the URL. Never mark done on assumption.
6. **Record:**
   - Check the box in `TASKS.md`.
   - Update `STATUS.md` (done, next, blockers, time remaining).
   - Append to `DECISIONS.md` if you made a non-obvious choice.
   - Append a short, specific entry to `BUILD_LOG.md` (what changed, what broke, what you learned, numbers).
   - `git add -A && git commit -m "<phase>: <task>"` (never commit `.env` or secrets).
7. **Repeat.**

## When stuck
- Same error 3 times → stop that approach, try a different one, log it in DECISIONS.md.
- Task exceeds 90 min → split it, ship the smaller version, log it.
- Needs a human (account, API key, payment, posting in Discord, submitting the form, registering the Harness ID on the event site) → add it to `HUMAN_TODO.md` with exact steps, then **continue with other tasks**. Use mocks/stubs behind a flag so work isn't blocked.
- Missing info → make the most reasonable choice, record it in DECISIONS.md, move on. Don't ask questions.

## Quality bar
- Prefer reliable over impressive. A 50s slideshow that always works beats a recording that fails 40% of the time.
- Every number shown publicly (`/stats`, submission, Discord posts) must come from the database or eval logs.
- Never claim features the product doesn't have.

## Stop conditions (write `DONE` file and stop when either is true)
- **Success:** every P0 task is checked AND SPEC "Definition of Done" holds. Then write a final summary in `STATUS.md` with the live URL, stats and remaining HUMAN_TODO items.
- **Only human work left:** every remaining P0 task depends on HUMAN_TODO items. Write a clear handback in `STATUS.md` and stop.
- **Hard stop:** Nov 19, 2026, 10:30 AM PST. Make sure the deployed version works, write the handback, and stop. Humans need the last 90 minutes to submit.

## Safety
- Don't run destructive commands outside this repo. Don't delete user data in `/data`.
- Don't spend beyond the budget caps in `.env`. Pause and log if a cap is reached.
- Never submit the hackathon form or post publicly. Drafts only; humans post.
