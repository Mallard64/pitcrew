**Type:** Build log

**Title:** Sandbox capabilities and limits aren't documented, so builders write probes mid-build

**Building:** Pit Crew makes pitch videos for GitHub-only projects: the agent clones, installs, runs and records the app in its sandbox, so team code never runs on our server.

**Blocked:** Our architecture depended on what the sandbox can do, and no page says. The protocol repo's self-hosting notes say the runner "ships ffmpeg, LibreOffice, Playwright". Our probes on the hosted service found:

| Check | Hosted result |
|---|---|
| CPU / RAM / disk | 4 vCPU, 3.4 GB RAM, no swap, 15 GB free |
| Runtimes | Node 22, Python 3.12, git; no root |
| ffmpeg | **not on PATH** (Playwright's copy under `/ms-playwright` only) |
| Display | `xvfb-run`/`Xvfb` present |
| Network | public web OK; `git clone` 1 s; `npm ci` 61 s |
| Max runtime | undocumented; `timeout_seconds: 1500` was accepted |

We made two architecture decisions blind and wrote two probe scripts (one cost about 390k input tokens).

**Cost to us:** two probe scripts plus a design change. Our first plan assumed ffmpeg would be in the sandbox.

**Loved:** once we knew the limits, the sandbox was excellent. It cloned, installed, started and Playwright-recorded a Next.js app in 154 s, and the webm came back intact through the session files API.

**Want:**
- A "Sandbox environment" docs page per base: CPU, RAM, disk, max `timeout_seconds`, network egress, preinstalled tools and versions, display, root or not, file size limits.
- Optionally, `GET /v1/environments/{base}` returning the same as JSON, so agents and builders can check before planning.

**Who benefits:** every builder choosing between "sandbox" and "my server", a day-1 architecture decision.

**Labels:** The Big Hack Game, sandbox, docs, onboarding

**Roadmap:** Related: #R?

