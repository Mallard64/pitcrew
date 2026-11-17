# STATUS

- **Phase:** 1–2 (harness scripts done; app in progress). Phase 0 live checks are blocked on keys.
- **Plan A or B:** B (hybrid), provisional. See DECISIONS.md.
- **Blockers:** HarnessRouter API key + Harness ID, TTS key (HUMAN_TODO.md). Everything runs in `HARNESS_MODE=mock` with the local planner meanwhile.
- **Deadline:** Nov 19, 2026, 11:59 AM PST · Feature freeze: Nov 18, 11:59 PM PST · Agent hard stop: Nov 19, 10:30 AM PST

## Done
- Phase 0 docs: `docs/hr-api.md` (UHP 2026-10-19 field names from the protocol repo).
- C0 scaffold (Next 16, Tailwind 4, vitest, zod schemas + tests).
- C1 `record_flow.ts`, C2 `tts.ts` (+providers), C3 `assemble.ts`, C4 `slideshow.ts`: all with passing tests.
- `src/lib/explore.ts` (site digest) and `src/lib/planner/local.ts` (LLM-free planner).

## Next
1. Pipeline (`src/lib/pipeline.ts`) + local end-to-end run on real sites.
2. Harness client (mock = local planner, real = UHP `/v1/responses` streaming).
3. DB, validation/SSRF/rate limits, job runner + SSE, UI pages, Dockerfile.
