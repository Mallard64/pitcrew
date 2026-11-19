**Type:** Build log

**Title:** Session files list returns the whole workspace, so finding a task's outputs is guesswork

**Building:** For GitHub-only projects, Pit Crew's agent records the running app in its sandbox and leaves `demo.webm`, `timings.json` and `shots/*.png`. Our server downloads them to build the video.

**Blocked:** `GET /v1/sessions/{id}/files` lists every file in the workspace. After a `git clone`, that was **91 entries**: the repo's README, `page.tsx` files, configs. Our three outputs were mixed in. To find them:

- Our docs notes didn't name the response key, so we guessed `data`. It's `files`, and our first download step silently found nothing.
- We filter by exact top-level paths and an allow-list (`demo.webm`, `timings.json`, `shots/*.png`), and cap downloads at 400 MB because we found no documented size limit.
- Nothing marks which files the task produced and which were already there.

**Cost to us:** about 45 minutes and one wasted probe run (about 390k tokens) before downloads worked.

**Loved:** each entry carries a `download_url`, `bytes` and `path`. The webm came back byte-exact and ffmpeg read it with no conversion issues.

**Want:**
- Query filters: `GET /v1/sessions/{id}/files?path_prefix=out/&created_after=<task start>&limit=50`, with pagination.
- A way for the agent to mark deliverables, e.g. an `artifacts` array on `response.completed` (or files in `/workspace/artifacts/`) that clients can fetch directly.
- Document the response shape, per-file and per-session size limits, and how long files are kept after the session.

**Who benefits:** any app that uses the agent to produce files (videos, reports, builds, datasets). That's a core reason to have a sandbox at all.

**Labels:** The Big Hack Game, sessions, artifacts, docs

**Roadmap:** Related: #R?

