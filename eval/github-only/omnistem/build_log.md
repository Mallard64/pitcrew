# OmniSTEM: Build Log

_Drafted by Pit Crew from commit messages. Edit before posting._

## May 25, 2026
- claude md files (`d745317`)
- initial prototype (`bd004de`)
- Added in description for incorrect (`d6066b4`)

## May 26, 2026
- Update page.tsx (`531ccdd`)
- Update nav.tsx (`a56935e`)
- Added in health additions for testing (`c7fb025`)

## May 28, 2026
- Update layout.tsx (`bc04563`)
- initial result - saved streak daily puzzles etc (`ebbbe60`)
- Settings (`95f9866`)
- Update settings-modal.tsx (`6b5e6e0`)
- Fixed settings redirect (`0932589`)
- Update settings-modal.tsx (`96a03d8`)
- initial (`7b8bcb3`)
- Add friends and store tabs (`223743a`)

## May 29, 2026
- Update friends and store tabs (`6b34dc2`)
- Merge main into friends-store-tab (`c7ac39f`)
- Merge remote-tracking branch 'origin/main' into ai (`6acc75d`)
- Merge remote-tracking branch 'origin/ai' into ai (`3d320eb`)
- Integrate Supabase auth + cloud persistence (hybrid local fallback) (`ccc3979`)
- Merge remote-tracking branch 'origin/main' into ai (`1a3e894`)
- Fixed darkmode (`4f47574`)
- Reconcile Supabase integration with main's data-format changes (`c42497f`)
- fix: correct bottom nav label display and icon rendering (`751e574`)
- Fix setState-in-render warning in LessonPage (navigate in effect) (`5afa94c`)
- Fix cloud writes (FK order) and auth/cache lifecycle (`44653eb`)
- Wrap lessons/complete in try/catch with error logging to surface the failure (`41df5e5`)
- Seed correct CED topic IDs (lo-1-*) to match the live app (`cac280f`)
- add daily chemistry games (`eb566b0`)
- Lootbox TEMP (`8cc70e6`)
- pricing (`ef8ac5f`)
- Update user.ts (`a0d6f2e`)
- Update user.ts (`7309338`)
- daily chemistry balancing game (`6accd56`)

## May 30, 2026
- Merge remote-tracking branch 'origin/main' into ai (`cdd49f9`)
- supabase (`cc15491`)
- Supabase friends (add by username) + email-only auth (`1cb3154`)
- Fix build break from daily-games merge (`4377885`)
- Scope friend_requests RLS policies to the authenticated role (`ffc5375`)

## Sep 16, 2026
- chore: remove build artifacts and local AI context from the repo (`abe4440`)
- feat: validate generated questions with zod and retry on invalid output (`05a3175`)
- chore: add eslint config and fix lint errors (`84dd182`)
- feat: add eval harness for the question generator (`df7193a`)
- ci: run lint, typecheck, and build on push and pull requests (`ee646b3`)
- docs: rewrite README to match what the app actually does (`58e3ae8`)

## Sep 20, 2026
- docs: add real app screenshots to the README (`bf6961d`)
- fix: correct stale feature claims on the landing page (`a016d7e`)
