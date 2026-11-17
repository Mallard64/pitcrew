# Context: The Big Hack Game

## Event
- Page: https://community.harnessrouter.ai/events/the-big-hack-game
- Format: Stanford vs. UC Berkeley. Build, launch and grow an AI agent product with **real users**.
- Only work done after kickoff (Nov 15) counts.
- **Submission + team formation deadline: Nov 19, 2026, 11:59 AM PST.**
  (The page header also says 11:59 PM. Treat 11:59 AM as the real deadline.)
- Demo day + results: Nov 20. Finalists demo live.

## Submission requirements
- Live link people can use right away (or GitHub repo if hard to deploy)
- Demo video
- **Harness ID**: the project's HarnessRouter harness. Usage is counted through it.

## Awards (share of prize pool) → what to optimize
| Award | Share | Implication for us |
|---|---|---|
| Grand Champion | 30% | Polished product + strong live demo |
| Real Customer Award | 20% | Real teams using it; testimonials; ideally someone paying or willing to |
| Distribution & Impact | 20% | Number of users/runs (tracked via Harness ID); public stats |
| School Cup | 20% | School-level, not per project |
| Best Build Log | 10% | Keep `BUILD_LOG.md` honest, specific, frequent |

No formal rubric is published. Inferred weights: real users 30, distribution 25, product/demo 25, build log 10, HarnessRouter fit 10.

## Why this idea wins
Every team in the hackathon must submit a demo video by the same deadline. Pit Crew solves that,
and our users are our own competitors, reachable today through the event Discords.
The longer-term pitch: software teams whose demo and docs videos go stale every release; Pit Crew regenerates them from the product itself.

## Links
- HarnessRouter docs: https://harnessrouter.ai/docs
- HarnessRouter repo (Community Edition, Apache-2.0): https://github.com/HarnessRouter/harnessrouter
- Unified Harness Protocol spec: https://github.com/HarnessRouter/harnessrouter/tree/main/protocol
- API reference on any HarnessRouter server: `$HARNESSROUTER_BASE_URL/v1/openapi.json` and `/v1/docs`
- TokenRouter (model credits, BYOK into HarnessRouter): https://www.tokenrouter.com/console
- Berkeley Discord: https://discord.com/invite/y8GsVZYtx
- Stanford Discord: https://discord.com/invite/AG8QX3zTf
- HarnessRouter office hours: https://calendly.com/contact-harnessrouter/30min
- Playwright video recording: https://playwright.dev/docs/videos
- FFmpeg docs: https://ffmpeg.org/documentation.html
- Piper (offline TTS fallback): https://github.com/rhasspy/piper

## Known HarnessRouter facts (from public sources, so verify)
- API follows the Unified Harness Protocol (UHP), modeled on the **OpenAI Responses API**: `POST /v1/responses`.
- Requests select a harness by **Harness ID** plus a model.
- Supports sessions (continue work in the same workspace), streaming events, files/artifacts, cancellation.
- Harness bases include Claude Code, Codex, Gemini CLI, OpenCode, Hermes, Aider, OpenHands and others.
- Hosted version runs each session in an isolated sandbox.
- **Unknown, verify in Phase 0:** sandbox outbound internet, whether Chromium/Playwright and ffmpeg can be installed, max runtime, file size limits for returned artifacts.
