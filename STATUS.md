# STATUS

- **Phase:** 2 done in mock mode; Phase 3 baseline eval done; Phase 0 live checks and Phase 4 deploy are blocked on human items.
- **Plan A or B:** B (hybrid), provisional until the sandbox probe runs.
- **Deadline:** Nov 19, 2026, 11:59 AM PST · Feature freeze: Nov 18, 11:59 PM PST · Agent hard stop: Nov 19, 10:30 AM PST

## Works now (verified)
- Full app runs locally, including the production standalone server: form → SSE progress → video → downloads → revise → feedback → /stats → /admin.
- 53 tests pass (`npm test`), plus lint, typecheck and build.
- Baseline eval (offline planner, no TTS) on 6 public sites: 2/6 pass all automated checks; the other 4 are app-style sites whose videos come out 24–35s (below 45s). See `eval/results.md`.

## Blockers (see HUMAN_TODO.md)
1. HarnessRouter API key + Harness ID → run `scripts/hr-smoke.ts` (+ `--probe`), then switch `HARNESS_MODE=real`.
2. TTS key.
3. Railway account + GitHub repo for deploy.

## Next for the agent once unblocked
1. Run the smoke + probe and record Plan A/B in DECISIONS.md.
2. Run `scripts/eval.ts` with `HARNESS_MODE=real` on ≥10 real Big Hack Game projects; fix the top 3 failure causes.
3. Verify revise ("make it shorter" → shorter) in real mode.
4. Deploy check: `/api/health`, one end-to-end job on the public URL, budget cap message.
