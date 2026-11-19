# Eval results

Run: 2026-11-17T21:27:30.742Z · planner: offline (mock) · TTS: none

**Automated "good": 2/6 (33%).** Narration accuracy and "≥3 distinct screens" are not auto-checked; review the videos in `eval/runs/2026-11-17T21-22-50-330Z`.

| Project | Status | Duration | Steps | Wall time | Failed checks | Notes |
|---|---|---|---|---|---|---|
| [Tailwind CSS](https://tailwindcss.com) | ok | 60.2s | 8/8 | 72s | none |  |
| [Excalidraw](https://excalidraw.com) | partial | 24.1s | 3/3 | 26s | 45-90s | duration 24.1s is outside 45-90s |
| [Hacker News](https://news.ycombinator.com) | partial | 34.3s | 6/6 | 37s | 45-90s | duration 34.3s is outside 45-90s |
| [tldraw](https://www.tldraw.com) | partial | 28.3s | 4/4 | 29s | 45-90s | duration 28.3s is outside 45-90s |
| [Squoosh](https://squoosh.app) | partial | 23.8s | 3/3 | 23s | 45-90s | duration 23.8s is outside 45-90s |
| [Bun](https://bun.sh) | ok | 86s | 10/10 | 94s | none |  |

## 2026-11-18 (night): GitHub-only projects + footage, production, 60 s target
Outputs are in `eval/github-only/<slug>/`: demo.mp4, thumb, script, plan, pitch check, log. The first attempt is in `run1/`.

| Project | Input | Mode used | Result | Length | Demo | Pitch check | Issues |
|---|---|---|---|---|---|---|---|
| OmniSTEM (Mallard64/stemduolingo) | repo only | sandbox-run | partial (length only) | 81.1 s | 4/4 steps recorded in the sandbox | 8/8 | Over the 60 s target. Run 1 hit a provider 429 and fell back to repo-showcase (4/8). |
| DevPad (yuchan-chung1964/DevPad) | repo only | sandbox-run | partial (length only) | 77.1 s | 5/5 steps (FastAPI docs page; the real "not authenticated" response shown honestly) | 8/8 | Over the 60 s target. Run 1 was blocked: storage full. |
| Hunt the Wumpus (Mallard64/Wumpus) | repo + 10.4 s gameplay upload | footage | run 1 ok, 57.7 s; run 2 **failed** | 57.7 s | 2 clips | 7/8 | Run 1: narration described scenes the clip didn't show (the agent couldn't see the footage) → fixed by keyframes as input_file. Run 2: the agent did look at the frames, then hit a provider 429 → offline plan, and the Remotion render was SIGKILLed → fixed with a render retry at concurrency 1. Rerun below. |
| Excalidraw (regression, live URL) | live + repo | live | ok | 66.2 s | 4/4 | 8/8 | none |

**Top issues found and fixed:**
1. Footage narration didn't match the footage. The agent now sees 3 keyframes per clip.
2. The model provider returned 429 mid-job. The agent is now retried once after 30 s.
3. The volume was full. Test-job files were deleted, and the guard refused jobs cleanly instead of crashing.
4. A killed render had no fallback for footage/repo videos. A retry was added.
5. 60 s targets ran 77–81 s. The agent now gets a word budget (verify on the next runs).

**Sensitive topics:** none of the three repos is a mental-health project (OmniSTEM is AP Chemistry), so the validator is covered by a synthetic mental-health plan in tests/outline.test.ts: it detects the topic, rejects treat/replace/outcome claims, and scrubs them.

**Wumpus rerun 3 (after both fixes, job 1zB8JuKN):** ok, footage mode, 54.9 s, 4 demo scenes (2 gameplay clips + 2 README screenshots), pitch check 7/8. The agent looked at the keyframes, and the narration now matches the clips ("The map warns, Bats nearby. Then a pit drops the player into three trivia questions").
**Done-when check:**
- All 3 repos produce a video with the correct mode labeled: OmniSTEM sandbox-run, DevPad sandbox-run, Wumpus footage.
- The live-URL regression (Excalidraw) is ok.
- The two sandbox-run videos overshoot the 60 s target (77–81 s); the word-budget fix is deployed but not re-measured.
