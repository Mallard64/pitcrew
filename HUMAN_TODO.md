# HUMAN TODO

Only a human can do these. Everything else runs in the repo. Deadline: **Nov 19, 11:59 AM PST**.

## 0. Tonight (Nov 17)
- [ ] **Post the Discord concierge offer tonight** (`launch/discord-post.md`) in the Berkeley and Stanford Discords: free pitch videos, run semi-manually until the app is live. Forward requests to Claude/the operator.
- [ ] **Create a Stripe payment link**: "Pit Crew HD: 1080p, no credit", $5. Put the URL in `.env` as `STRIPE_PAYMENT_LINK`.
- [ ] **Pick/license a background music set (royalty-free)**: 1–3 tracks per mood (calm, upbeat, bold, playful). Put them in `assets/music/<mood>/` and note the license source in DECISIONS.md.
- [ ] **Needed (Phase 0 decided research runs server-side):** get a search API key (e.g. Brave, Tavily or SerpAPI) → `.env` as `SEARCH_PROVIDER` + `SEARCH_API_KEY`.

## 1. Keys and Harness ID
- [x] HarnessRouter API key and Harness ID in `.env` (`HR_API_KEY`, `HARNESS_ID`). Base URL corrected to `https://api.harnessrouter.ai` (it pointed at TokenRouter).
- [x] TokenRouter key with credit saved in HarnessRouter BYOK; smoke test + probe passed.
- [ ] Fix `HARNESSROUTER_BASE_URL` at the source you copy `.env` from: it must be `https://api.harnessrouter.ai` (it keeps reverting to TokenRouter's URL).
- [ ] Get a TTS key: ElevenLabs preferred (gives word timings for highlighted captions) or OpenAI (`TTS_PROVIDER`, `TTS_API_KEY`). Without one, videos are silent with captions.

## 2. Event page
- [ ] Create/confirm the team: https://community.harnessrouter.ai/events/the-big-hack-game
- [ ] Name the project "Pit Crew" in the Projects tab and add the **Harness ID** so usage counts.

## 3. Deploy (Railway, about 15 min)
- [ ] Create a GitHub repo and push: `git remote add origin … && git push -u origin main`
- [ ] Railway → New Project → Deploy from GitHub repo (it uses `Dockerfile` + `railway.json`).
- [ ] Add a **Volume** mounted at `/data`.
- [ ] Set variables: everything from `.env` **except** `DATA_DIR` (the image sets `/data`). Set a long random `ADMIN_TOKEN`.
- [ ] Generate a public domain, open `/api/health` (all `true`), then make one video from the home page.
- [ ] Tell Claude the URL so it can update README, the launch drafts and run the eval against prod.

## 4. Launch (after deploy)
- [ ] Post the updated `launch/discord-post.md` again once the app is live.
- [ ] DM teams directly; offer to run it for them. Ask happy users for a one-line quote (the 👍 form has a consent checkbox).
- [ ] Ask in Discord/office hours whether hosted sandboxes allow Chromium + ffmpeg + egress (decides Plan A vs. B): https://calendly.com/contact-harnessrouter/30min

## 5. Submission (by Nov 19, 11:59 AM PST)
- [ ] After results, send Claude the official finalist list so `/admin` can mark which finalists used Pit Crew (never guessed).
- [ ] Make our own pitch video with Pit Crew (dogfooding) → save as `launch/our-demo.mp4`.
- [ ] Submit: live link, repo, `launch/our-demo.mp4`, Harness ID, text from `launch/submission.md` (fill the numbers from `/stats`).
- [ ] Rehearse `launch/demo-day-script.md` for Nov 20.
