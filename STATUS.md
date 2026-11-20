# STATUS

- **Deadline:** Nov 19, 2026, 11:59 AM PST. Live at https://pitcrew-production-83e5860b.up.railway.app (Railway, manual "Deploy latest commit").
- **Phase:** feature-complete for submission; tonight's work: pitch outline, GitHub-only projects, team footage, sensitive-topic guardrails.

## Pitch Room (Nov 19, live)
- **Production URL:** https://pitcrew-production-83e5860b.up.railway.app. `PITCH_ROOM_ENABLED=true` is set on Railway; commit `389369a` is deployed. The checkbox is on the form.
- **Did it work: yes.** Production job [707K-tZr](https://pitcrew-production-83e5860b.up.railway.app/jobs/707K-tZr) (Excalidraw, 60 s):
  - all 3 drafts came back (claude-haiku-5.5);
  - the judge (claude-fable-5-2) picked "customer story" at 7.8/10; the other two scored 6.8 and 6.8;
  - no draft was capped for unverified numbers;
  - "Use this one" on the data-first draft worked: the rendered script.md is that draft;
  - final result: `ok`, 63.8 s, 4/4 steps.
- **Time and token cost:**
  - Pitch Room itself took 62.5 s and 38,282 tokens (32,745 in / 5,537 out), drafts and judge combined. HarnessRouter returns tokens only, no USD.
  - The whole job took 13:30, including the review wait while I took screenshots.
  - The local e2e run (Hunt the Wumpus, footage, 60 s) took 70 s and 39,085 tokens. It came back `ok` at 62.4 s.
- **Cost note:** this is on top of the normal plan, research and judge-pass calls. Only the winner is voiced and rendered.
- **Normal (non-Pitch-Room) run after the deploy:** works. Job Qr8JKBWh (JSON Crack, 60 s, Pitch Room off): `ok`, 57.2 s video, 4/4 steps, harness plan, 5:18 total. Run after temporarily raising `MAX_JOBS_PER_USER_PER_DAY` 20 → 30 on Railway, set back to 20 afterwards.
- **Three different draft models (Nov 19):** each angle now gets a cheap model from a different provider (`claude-haiku-5.5`, `gpt-5.4-mini`, `gemini-3.8-flash`); judge stays `claude-fable-5-2`. Real check on sample JSON Crack scenes: 3/3 drafts parsed, judge picked customer story (7 / 5.8 / 6.8), 81.5 s, 75,278 tokens (about twice the single-model run; inputs are counted per model). Override with `PITCH_ROOM_DRAFT_MODELS` (comma list).
- **Three-model production run:** job aaJHdird (JSON Crack, 60 s): customer story / `claude-haiku-5.5` 8.3 (judge's pick), data-first / `gpt-5.4-mini` 6.5, demo-first / `gemini-3.8-flash` 6.3; Pitch Room 83.3 s, 64,590 tokens (59,642 in / 4,948 out). Final `ok`, 54.3 s video, 4/4 steps. Screenshot: `launch/demo-backup/pitch-room-three-models.jpg`. Limit raised to 30 for the run and set back to 20.
- **Screenshots:** launch/demo-backup/pitch-room-review.jpg (cards with "Use this one") and pitch-room-done.jpg (finished job, "Your pick" next to "Judge's pick").
- **Limits:**
  - Drafts rewrite narration only. On-screen headlines stay from the main plan, so a picked draft can open with different words than the title card.
  - A Pitch Room job always pauses for review. With no pick, it auto-continues with the winner after 10 minutes.
  - The draft and judge models come from a fixed preference list filtered by GET /v1/harnesses/{id}/models (it lists no prices). Override with PITCH_ROOM_DRAFT_MODEL / PITCH_ROOM_JUDGE_MODEL.
- **You need to:** nothing required. To turn it off: Railway → Variables → set `PITCH_ROOM_ENABLED=false` → Deploy.

## Works now (verified)
- **Live-URL jobs:** the real agent on HarnessRouter plans, the demo is recorded in Chromium, voiced (ElevenLabs, 10 voices) and rendered with Remotion at 1080p60. In the wide test, 7 of 8 production jobs came back ok (Excalidraw, Hoppscotch, Carbon, Mermaid, Squoosh after the step repair, JSON Crack); shadcn/ui came back partial with a screenshot demo.
- **Pitch outline:** problem → solution → demo → evidence → how it's built → next → ask. Empty sections are omitted. The default length is 90–120 s, with presets 60 s / 2 min / 3 min.
- **GitHub-only projects:** the live URL is optional when a public repo is given. The demo mode is chosen automatically and shown on the job page:
  - `sandbox-run`: the repo runs inside the HarnessRouter sandbox (Phase 0 verified clone/install/start/record/download).
  - `repo-showcase`: README images, code panels, architecture diagram.
  - `footage`: an uploaded MP4/MOV.
  - Games never build the engine.
- **Footage:** the agent sees 3 keyframes per clip (input_file) and narrates what's on screen.
- **Sensitive topics:** detection, an on-screen disclaimer, a validator (one agent rewrite, then scrub). Unit-tested with a synthetic mental-health plan.
- **Reliability:**
  - Step repair from the page's real elements, then re-record.
  - Low-memory polish path.
  - A screenshot fallback instead of a blank demo.
  - Disk guard and pruning.
  - One retry when the model provider rate-limits.
- **Checks:** 105 tests pass; lint and build are clean.

## Doesn't work / limits
- **cli-run** (terminal recording) is not built; CLI repos get repo-showcase. The game-binary xvfb recording is not built.
- **Storage:** the Railway volume is only 434 MB. Each finished job keeps ~10–35 MB, so plan to grow it or prune old jobs regularly. Test-job files were deleted on Nov 18 to free space (job rows remain).
- **Provider rate limits:** the model provider behind TokenRouter returned 429 during one eval run. The job falls back to the offline planner (weaker video) after one retry.
- **Clip polish on ui.shadcn.com** was SIGKILLed twice on Railway (cause unknown); the job degrades to screenshots and reports partial.
- **Real users:** no real-user feedback yet. /stats only counts our own test runs.

## Our demo video (launch/our-demo.mp4, 2:42, 1080p60, H.264 + AAC)
Path B: Pit Crew didn't make this video by itself, so the video says "Rendered with Pit Crew's own video engine", not "made by Pit Crew".
- **What's real:** every product shot is a screen recording of the live site from tonight:
  - a real Excalidraw job (form → agent → script review with one edit → finished video)
  - the OmniSTEM, DevPad and Wumpus job pages playing their generated videos
  - the pitch videos' own audio is mixed under their playback, in sync
- **What's edited:** the ~6.6 min agent wait is sped up ×44 and labeled. The narration, captions, diagram and title cards were rendered by Pit Crew's renderer (Blueprint look, Sarah voice) from a hand-written plan (`scripts/build-our-demo.ts`).
- **No stats, no user claims:** the test runs are labeled as ours.
- **Files:** narration in launch/our-demo-script.md, captions in launch/our-demo.srt, sources in launch/our-demo-sources.md.

## What I (the human) need to do
- Watch launch/our-demo.mp4 once with sound.
- Upload it to YouTube as **Unlisted**: Create → Upload video → pick the file → Visibility: Unlisted → Publish → copy the link. (Or Loom: New video → Upload a video.) Optionally add launch/our-demo.srt as subtitles.
- Paste the link into the project page's **Demo video** field and submit before **Nov 19, 11:59 AM PST**.
- Optional: grow the Railway volume (Settings → Volume) if real traffic comes in.

## GitHub-only eval (Nov 18 night)
See eval/results.md and eval/github-only/.

## Build log addendum + Blocked #5 check (Nov 19)
- `launch/build-log/ADDENDUM.md`: endpoints used, 12 real production runs, timeline. Tokens/cost per job are "not recorded" except the Pitch Room step (HarnessRouter reports tokens, not USD).
- **Blocked #5 (full PUT / casing) still valid.** No harness-update helper (e.g. a `harness_config.py` "ensure") is vendored in our repo; GitHub code search of HarnessRouter/harnessrouter finds no `harness_config`, the HarnessRouter/skills repo has no harness-config file, and protocol 2026-10-19 lists `PATCH` only for memory records, not harnesses. Code search can miss files, so this is "not found", not "doesn't exist".
- Optional one-line clarification for the post: "Update: we looked for an official helper that updates a Harness (in the protocol docs and the skills repo) and didn't find one; if it exists, a link from the Harness API docs would solve most of this."

## Public landing page update (Nov 19, commit ccdffa1, live)
- **Live:** https://pitcrew-production-83e5860b.up.railway.app. Railway did not auto-deploy the push; I triggered "Deploy latest commit" by hand.
- **What changed (website only):** traction strip, pilot-partner line (behind a flag, off), pricing section, 4-video example gallery labeled "test run", "How it works on HarnessRouter" section, hero badge no longer shows the passed deadline, hero copy says the progress update needs a public repo.
- **Numbers shown and where they come from** (all computed live by `getStats()` in `src/lib/db.ts` from the production `jobs` table):
  - **23 videos made**: jobs with status ok or partial.
  - **3 builders**: distinct `client_key` (hashed IP) with at least one delivered video. This counts IPs, not people, and includes our own test runs. It is lower than the "5+ builders" on the project page, so that page should say 3 unless there's another source.
  - **Success rate on /stats: 79%** (delivered ÷ finished). Not changed to 91%: the DB doesn't show 91%. If the newer successful runs were in production, the number would already reflect them. Local runs aren't in the production DB.
  - **Paid / collected: not shown.** Stripe holds these, not our DB. To show "N paid to keep going after the free limit ($X collected)", set `TRACTION_PAID_COUNT` and `TRACTION_COLLECTED_USD` on Railway from the Stripe dashboard.
- **Pricing:**
  - **Free tier:** reads "Up to 20 videos a day per team" from `MAX_JOBS_PER_USER_PER_DAY`, because "your first video" isn't true while the limit is 20. It switches to "Your first video" automatically if the limit is set to 1.
  - **$5 price:** taken from the request; I couldn't read the Payment Link's price from its page.
  - **Contact:** links to GitHub issues, since no contact email is configured.
- **"Costs us about $X per video" omitted.**
  - `GET /v1/sessions/{id}` does return `spend_usd`, but our production session ids (`hr_session_id`) live only in the production DB, which isn't reachable from here.
  - `GET /v1/sessions` mixes local and production sessions with no job link.
  - Several sessions with 30k+ tokens report `spend_usd: 0`, so the figures don't look like complete cost.
- **Pitch Room "merges":** no such wording on the site. Copy says the judge scores the drafts and picks the best one.
- **Verified live:**
  - All sections render.
  - The pilot line is absent with the flag off.
  - All 4 gallery files return 200/206 `video/mp4` and decode at full length.
  - In-browser playback could not be confirmed: the automated Chrome window was hidden, so it never loaded media.
  - The 3 numbers match /stats.
  - The job API still answers. My IP is over the daily limit, so it returns 429 with the pay link.
  - No new job was run.
  - The mobile layout was not visually checked (the window resize didn't apply).
- **Gallery user-video candidates:** none. All 4 gallery videos (tldraw, Excalidraw, JSON Crack `Qr8JKBWh`, Hunt the Wumpus `1zB8JuKN`) are our own test runs. The admin page lists any outside jobs. Nothing from users is published.
- **Human to-do:**
  1. When your friend confirms, set `PILOT_PARTNER_ENABLED=true`, `PILOT_PARTNER_SIZE=<N>` and `PILOT_PARTNER_SEASON=<season>` on Railway. The event is never named.
  2. Optionally set `TRACTION_PAID_COUNT` and `TRACTION_COLLECTED_USD` from Stripe.
  3. Set `BUILD_LOG_URL` to the HarnessRouter build log thread; no thread URL is recorded in the repo, so the link is hidden.
  4. Watch a gallery video once on the live site.
  5. Each Railway variable change redeploys and kills running jobs.

## Traction + organizer update (Nov 19, commit 1bd2465, live)
- **Live:** https://pitcrew-production-83e5860b.up.railway.app.
  - Deployed together with 4 new Railway variables: `PILOT_PARTNER_ENABLED=true`, `TRACTION_PAID_COUNT=3`, `TRACTION_COLLECTED_USD=15`, `TRACTION_ORGANIZER_USD=100`.
  - `TRACTION_ORGANIZER_RECEIVED` is not set (defaults to false).
- **Traction strip as rendered:** "23 videos made · 3 builders · $15 collected · 3 paying users · $100 committed by a hackathon organizer · live stats".
  - **23 videos made, 3 builders:** computed live from the production `jobs` table.
  - **$15, 3 paying users, $100 committed:** reported by Felix, not in our DB. The fallback wording was used because no payment record we can read shows the $100 received:
    - our DB stores no payments;
    - the Stripe dashboard wasn't signed in on the automation browser, and I didn't sign in.
  - **To switch to "$115 collected · 4 paying customers, including our first hackathon organizer":** once the $100 shows in Stripe, set `TRACTION_ORGANIZER_RECEIVED=true`, `TRACTION_COLLECTED_USD=115` and `TRACTION_PAID_COUNT=4`.
- **Organizer line (live):** "Our first organizer customer: an upcoming student hackathon is giving Pit Crew to every team."
  - It replaces the old pilot line; `PILOT_PARTNER_SIZE` and `PILOT_PARTNER_SEASON` are gone.
  - Set `ORGANIZER_LINE` to the named "Startup Sprint 2027 …" text (event page: "Startup Sprint 2027", online, Dec 1–8, 2026, hosted by Iris Z; checked Nov 19 and it doesn't mention Pit Crew yet) once they approve. The event isn't named anywhere until then.
- **For organizers block (live, under pricing):** "Give every team at your hackathon a pitch video. Organizer plans from $100 per event." with a Contact us link to GitHub issues.
- **Checks:** typecheck, lint and build pass. I checked the live page through its HTML and a browser screenshot.
- **Railway:** variable changes redeploy and kill running jobs. Set all the switch-over values in one go.

## Traction / organizer / limit update (Nov 19, commit 608a85e, live)
- **Railway variables changed (one deploy):**
  - `MAX_JOBS_PER_USER_PER_DAY` 20 → 5
  - `TRACTION_COLLECTED_USD` 15 → 115
  - `TRACTION_PAID_COUNT` 3 → 4
  - new `TRACTION_ORGANIZER_RECEIVED=true`
  - new `ORGANIZER_LINE`
  - new `ORGANIZER_URL=https://hackathonhost.com/events/startup-sprint-2027`
- **Live traction strip:** "23 videos made · 3 builders · $115 collected · 4 paying customers, including our first hackathon organizer · live stats".
- **Live organizer line (linked to the event page):** "Startup Sprint 2026 (online, Dec 1–8) is our first organizer customer."
- **Live pricing:** "Up to 5 videos a day per team."
- **Sources and caveats:**
  - **23 videos, 3 builders:** production DB.
  - **$115 / 4 paying customers:** reported by Felix, chosen over the recommended "hide until Stripe is shown". It is not reconciled with our records:
    - our DB stores no payments, and Stripe wasn't readable here;
    - the pay button appears only after one IP hits the daily limit (20/day from 10:33 AM, when the link went live, until this change);
    - the DB has 3 builders including our own test IPs, so it can't account for 3 individual payers.
  - **Limit history:** the repo records 20/day today. I didn't write that it was lower when people paid, because nothing shows that. 5/day is true from this deploy on.
  - **Organizer name:** the line uses "Startup Sprint 2026" as Felix specified. The linked event page title is "Startup Sprint 2027" (dates Dec 1–8, 2026) and, as of this check, it doesn't mention Pit Crew.
- **Builders, one number everywhere:** 3 (distinct IPs with a delivered video). The project page on the hackathon site says "5+ builders"; Felix should change it to 3. I can't edit that page.
- **Project page "merges":** Felix should change the Pitch Room sentence to say the judge agent scores the drafts and picks the best one. I can't edit that page.

### Builder count + event name confirmed (Nov 19)
- **Builders: 5+.** Felix confirmed there are 5+ builders. The DB's 3 counts distinct hashed IPs, which undercounts teammates on a shared network.
  - New optional `TRACTION_BUILDERS` (digits with an optional "+") shows the team-reported count on the landing page. Unset = DB count.
  - Set to `5+` on Railway, so the site now matches the project page ("5+"). /stats still shows the raw DB metrics.
  - This supersedes the "say 3" note above. The project page needs no change.
- **Event name:** Felix confirmed "Startup Sprint 2026" is correct. The "2027" in the event page title/URL is the host's naming; our line stays as is.

### Payments total updated (Nov 20)
- Felix reported $365 collected in customer payments (paying-customer count not confirmed). Not reconciled against Stripe from here.
- Landing page now shows "$365 collected, including our first hackathon organizer" with no customer count: `TRACTION_COLLECTED_USD=365`, `TRACTION_PAID_COUNT=0` (0/unset = count hidden; code change in this commit).
- Update: Felix reported 5 paying customers (3 builders, 2 hackathon organizers). Live strip: "$365 collected · 5 paying customers, including 2 hackathon organizers" via `TRACTION_PAID_COUNT=5`, new `TRACTION_ORGANIZERS=2`. Not reconciled against Stripe from here.
