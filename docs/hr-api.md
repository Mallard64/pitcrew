# HarnessRouter / UHP API notes (Phase 0)

Source: `protocol/versions/2026-10-19/` in https://github.com/HarnessRouter/harnessrouter (read 2026-11-17).
Not yet verified against a live server: no API key yet (see HUMAN_TODO.md).

## Run a task
`POST {BASE}/v1/responses`, `Authorization: Bearer <key>`
```json
{ "input": "...", "model": "claude-sonnet-4.6", "metadata": { "harness_id": "chrn_..." },
  "stream": true, "instructions": "...", "timeout_seconds": 480, "max_step": 60 }
```
- Harness is selected by **`metadata.harness_id`** (not a top-level field). Unknown id → 404 `harness_not_found`.
- `model` optional (harness default). Substitution is reported as `metadata.requested_model` + `metadata.model_fallback`.
- Unknown request fields are ignored and listed in `metadata.ignored_fields`.
- Optional `Idempotency-Key` header.

## Response object
`{ id: "resp_...", object: "response", status, error, incomplete_details, model, output[], usage, metadata.session_id, previous_response_id }`
- `status`: in_progress | completed | incomplete | failed | cancelled
- `output[]` item types: `message` (content[].type=`output_text`, `.text`, `.annotations`), `reasoning` (summary[].text),
  `function_call` (name, arguments JSON string), `function_call_output` (call_id, output), `input_request`.

## Streaming (SSE, `data: {json}` per event; every event has `type` + `sequence_number`)
- Lifecycle: `response.created`, `response.in_progress`, terminal: `response.completed` | `response.incomplete` | `response.failed` (carries the full final `response`).
- Items: `response.output_item.added` / `response.output_item.done` (`item`).
- Text: `response.output_text.delta` (`delta`), `response.output_text.done` (`text`).
- Reasoning: `response.reasoning_summary_text.delta`.
- Tools: `response.function_call_arguments.delta|done`.
- `error` event (`code`, `message`) is always followed by a terminal event.
- Dropped connection does not abort the task; recover with `GET /v1/responses/{id}`.

## Sessions
- Continue: same body with `previous_response_id: "resp_..."` → same session, same working directory, same harness.
- Expired → 404 `session_expired`. Cancel: `POST /v1/responses/{id}/cancel`.

## Files / artifacts
- Artifacts are `container_file_citation` annotations on message text: `{container_id, file_id, filename, download_url}`.
- List: `GET /v1/sessions/{session_id}/files`. Download: `GET /v1/containers/{container_id}/files/{file_id}/content` (raw bytes).
- Upload: `POST /v1/files` (multipart) or inline `input_file` data URLs.

## Errors
Non-2xx body: `{ "error": { "type", "code", "message", "param", "detail" } }`.

## Sandbox capabilities (from docs, unverified on the hosted service)
- `docs/environments.md` + self-hosting guide: the runner image ships **ffmpeg, LibreOffice, Playwright**; tasks can reach the network.
- `docs/browser-column.json`: every base (claude-code, codex, …) passed a browser navigate/click task (2026-09-27).
- Default task budget: `timeout_seconds` (1 hour by default on self-hosted).
