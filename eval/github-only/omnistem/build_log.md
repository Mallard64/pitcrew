## 2026-05-25 to 2026-05-26
- Built: initial prototype with Claude context files, an incorrect-answer explanation, and health additions for testing.

## 2026-05-28
- Built: saved streaks and daily puzzles in local storage, a settings modal, and the friends and store tabs.
- Decided: keep state in the browser first so the app works without an account.

## 2026-05-29
- Built: Supabase auth and cloud persistence with a local fallback, a daily chemistry balancing game, and lootbox and pricing work for the store.
- Struggled: cloud write ordering (foreign keys) and a setState-in-render warning in the lesson page. Both were fixed.
- Decided: seed the correct CED topic IDs (lo-1-*) to match the live app.

## 2026-05-30
- Built: Supabase friends (add by username), email-only auth, and RLS policies scoped to the authenticated role.
- Struggled: a build break after the daily-games merge, fixed the same day.

## 2026-09-16
- Built: zod validation with retry for generated questions, an eval harness for the generator, ESLint config, and CI running lint, typecheck and build.
- Decided: remove build artifacts and local AI context from the repo, and rewrite the README to match what the app does.

## 2026-09-20
- Built: real README screenshots; corrected stale feature claims on the landing page; merged the friends PR (#15).