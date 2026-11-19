**Type:** Build log

**Title:** Provider 429s surface as "your key was refused" and fail the task instead of retrying

**Building:** Pit Crew runs one HarnessRouter task per pitch video: the agent explores a site or runs a repo in its sandbox, then returns a video plan. We ran 4 production jobs back to back.

**Blocked:** Mid-task, the upstream provider rate-limited us. HarnessRouter failed the whole task and worded it as a key problem:

```
error: Your tokenrouter key was refused: The model provider refused the request
(429: Too many requests. Please try again later. (request id: 2026111904464647…))
→ response.failed
```

Steps we observed (intermittent):
1. Run 3–4 back-to-back multi-minute tasks (sandbox runs, vision) on `claude-sonnet-5.5` via BYOK.
2. One task fails partway through (after 10 tool calls) with the event above.

- **Expected:** the router retries the provider call with backoff, or returns a clear `rate_limited` error with `retry_after`.
- **Actual:** `response.failed`; the work so far is lost. "Key was refused" sent us to check the key, which was fine (the next job ran on it).

**Cost to us:** this hit 2 of the 8 production jobs where the agent ran that night. Both fell back to our offline planner, which wrote weaker videos (pitch check 4/8 and 2/8, against 7–8/8 when the agent ran). Adding a retry (30 s wait, once) took about 10 minutes, plus re-running both jobs.

**Loved:** the provider's request id and status pass through verbatim, so the cause was clear once we read past "refused".

**Want:**
- A distinct error type and code: `{"type":"rate_limit_error","code":"provider_rate_limited","retry_after":30}`. Don't phrase it as a key failure.
- Optionally, retry provider 429s inside the task (capped) so a long run isn't thrown away.

**Who benefits:** every long-running task, especially multi-minute sandbox runs. Clear codes let builders retry instead of rotating keys.

**Labels:** The Big Hack Game, errors, byok, reliability

**Roadmap:** Related: #R?

