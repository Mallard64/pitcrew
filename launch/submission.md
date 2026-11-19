# Submission text (draft; fill <> from /stats before submitting)

**Pit Crew**: paste your project's live link, get a pitch video, a progress update draft and your submission text in minutes. Others record a walkthrough; Pit Crew makes your pitch.

Every team in this hackathon has to ship a demo video by the same deadline. Pit Crew's HarnessRouter agent reads your live site, README and commits, writes the pitch (problem → solution → demo → what's next), directs the edit (style kit, layouts, transitions), and our server records and renders it with Remotion. Every statistic is checked against its source page. You can revise it in plain words ("make it shorter"), and the revision continues the same HarnessRouter session.

- Live: <LIVE_URL>
- Repo: <REPO_URL>
- Harness ID: <HARNESS_ID>
- Demo video (made with Pit Crew): launch/our-demo.mp4
- Traction (from /stats at <TIME>): <N> videos for <M> teams, <F> finalists used Pit Crew, <X>% success rate, median <T> per video
- Quotes (only with consent): <QUOTES>

How it works: the HarnessRouter agent does the thinking (plans the click-flow, writes the narration and a progress update from your commits). Our server does the mechanics (Playwright, TTS, ffmpeg), with fallbacks so a team always gets a usable video.
