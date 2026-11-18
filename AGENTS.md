<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Pit Crew: Codex entry point

You are Codex on **Pit Crew** (The Big Hack Game, HarnessRouter). Your task list is **`CODEX_TASKS.md`**; follow its Order line. Claude Code owns `TASKS.md` (harness, prompt, HarnessRouter integration, eval, launch); don't take those tasks.

Read in this order: `CONTEXT.md` → `COMPETITORS.md` → `SPEC.md` (video structure, Remotion rendering, statistics rules) → `HARNESS.md` (the video-plan contract you render) → `CODEX_TASKS.md` → `LOOP.md`.

Rules:
- **Deadline: Nov 19, 2026, 11:59 AM PST. Feature freeze: Nov 18, 11:59 PM PST.**
- Build-order priority: reliable demo recording + zoom → problem/solution/end scenes with 2 style kits → diagram engine → more kits/layouts/transitions → self-review pass. A simpler video that always renders beats a fancy one that sometimes breaks; keep the ffmpeg slideshow fallback working.
- The agent never writes SVG/CSS; you turn its plan JSON into video using the vocabulary (primitives, layouts, motion, transitions, kits). Every variation comes from the plan's `seed`.
- No statistic renders without a verified source entry (validator rule). Never estimate or round numbers.
- Never commit secrets (`.env`, `HR_API_KEY`). Keep tests green (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`).
- Record non-obvious choices in `DECISIONS.md` and a short entry in `BUILD_LOG.md`, as LOOP.md says.

