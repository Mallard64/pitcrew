# Unverified candidates: test before posting

These came up as possible friction but aren't evidenced in our records yet. Each has a test of about 5 minutes.

1. **Harness ID is only findable under Settings** (the event form links to a YouTube timestamp to explain it).
   *Test:* log in fresh, try to find the Harness ID from the dashboard home without the video, and note the clicks and screens. Post it only if it takes more than 2 non-obvious clicks.
2. **Exact 403 body for an unfunded BYOK key** (to strengthen post 04).
   *Test:* in a throwaway HarnessRouter workspace, save an empty-balance TokenRouter key under BYOK, run `npx tsx --env-file=.env scripts/hr-smoke.ts`, and save the response body (redact ids).
3. **Session expiry time** (`404 session_expired` exists, but the TTL isn't documented). It matters for human-review pauses.
   *Test:* run a task, wait 15, 30 and 60 min, then send a follow-up with `previous_response_id` and record when it starts returning 404.
4. **Maximum `timeout_seconds` on the hosted service** (1200 s worked; the cap is unknown).
   *Test:* a task with `timeout_seconds: 3600` that runs `sleep 1500`; record whether it's rejected up front or killed, and the error.
5. **Max artifact size for session file downloads.**
   *Test:* in the sandbox, `head -c 500M /dev/urandom > big.bin`, then list and download it; note any size cap or error.
6. **TokenRouter BYOK flow** (voucher → create key shown once → paste into Profile → Bring Your Own Key) being hard to follow.
   *Test:* redo it with a new key and note where the "shown once" key could be lost. We had a stale-key mix-up (folded into post 04), but no evidence that the flow itself is confusing.
