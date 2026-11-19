**Type:** Build log

**Title:** Updating a Harness needs a full PUT of every field, so prompt edits risk wiping settings

**Building:** Pit Crew's agent behavior lives in the Harness instructions. We changed them 6 times in two days, adding new video features, a footage mode and sensitive-topic rules, while production was live.

**Blocked:** To change only the instructions, we have to:
1. `GET /v1/harnesses/{id}` and keep the ETag.
2. Convert every live field from camelCase to snake_case (`engineMember` → `engine_member`, …).
3. `PUT` the complete object with `If-Match`, because PUT replaces it and any omitted field resets to its default.
4. Re-read and compare, because a field-mapping mistake fails silently.

That is a 70-line script (`scripts/hr-harness.ts`) for a one-field change. Separately, a Harness's base can't be changed (we're on `hermes`). Switching would mean a new Harness ID, and usage is tracked per ID.

**Cost to us:** about 1 hour writing and checking the script. Every later update needed a careful diff first.

**Loved:** ETag + `If-Match` is the right design. It refused stale writes, and the re-read never showed a mismatch across 6 updates. Instructions living on the Harness rather than in each request also kept our prompts small.

**Want:**
- `PATCH /v1/harnesses/{id}` with merge semantics (and still `If-Match`): `{"instructions":"…"}` changes only that field.
- Accept the same casing on write as on read, or document the mapping.
- Instruction versions with a rollback (`GET /v1/harnesses/{id}/versions`), since instructions are effectively deployed code.
- Document why `base` is immutable and how to migrate while keeping usage history.

**Who benefits:** any team that iterates on prompts in production. Today every edit risks resetting the model, tools or limits.

**Labels:** The Big Hack Game, harness-api, dx, docs

**Roadmap:** Related: #R?

