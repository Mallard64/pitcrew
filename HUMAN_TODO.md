# HUMAN TODO

Only a human can do these. Everything else runs in the repo. Deadline: **Nov 19, 11:59 AM PST**.

## 1. Keys and Harness ID (unblocks Phase 0, about 20 min)
- [ ] Claim TokenRouter credits and add the key to HarnessRouter (Profile → Bring Your Own Key → TokenRouter), following the "Claim Your TokenRouter Credits" PDF.
- [ ] In HarnessRouter, create the harness:
  - Base: **Claude Code** · Name: `pit-crew` · default model: your pick (Sonnet-class works)
  - System prompt: paste `PLAN_INSTRUCTIONS` from `src/lib/harness/real.ts` (the app also sends it as `instructions` per task, so this is a safety net)
  - Copy the **Harness ID** (`chrn_…`) and create an **API key**.
- [ ] Put them in `.env`: `HARNESS_MODE=real`, `HARNESSROUTER_BASE_URL=…`, `HARNESSROUTER_API_KEY=…`, `HARNESS_ID=chrn_…`
- [ ] Run `npx tsx --env-file=.env scripts/hr-smoke.ts` (should print "pit crew online") and `… scripts/hr-smoke.ts --probe`. Paste both outputs to Claude so it can record the Plan A/B decision.
- [ ] Get a TTS key: OpenAI (`TTS_PROVIDER=openai`, `TTS_API_KEY=sk-…`) or ElevenLabs. Without one, videos are silent with captions.

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
- [ ] Post `launch/discord-post.md` in the Berkeley and Stanford Discords.
- [ ] DM teams directly; offer to run it for them. Ask happy users for a one-line quote (the 👍 form has a consent checkbox).
- [ ] Ask in Discord/office hours whether hosted sandboxes allow Chromium + ffmpeg + egress (decides Plan A vs. B): https://calendly.com/contact-harnessrouter/30min

## 5. Submission (by Nov 19, 11:59 AM PST)
- [ ] Make our own demo with Pit Crew (dogfooding) → save as `launch/our-demo.mp4`.
- [ ] Submit: live link, repo, `launch/our-demo.mp4`, Harness ID, text from `launch/submission.md` (fill the numbers from `/stats`).
- [ ] Rehearse `launch/demo-day-script.md` for Nov 20.
