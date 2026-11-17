# Pit Crew: Build Log

Public log for the Best Build Log award. Short, specific, honest entries: what we built, what broke, numbers.

## Nov 17
- Picked the idea: every Big Hack Game team needs a demo video by Nov 19, so Pit Crew makes one from a live link.
- Wrote the spec, harness design and an autonomous build loop for Claude Code.

## Nov 17 (afternoon)
- Read the UHP spec. Harness is picked with `metadata.harness_id`; sessions continue with `previous_response_id`; artifacts come back as `container_file_citation` annotations. Notes in `docs/hr-api.md`.
- Built the video pipeline as tested scripts: Playwright recorder (with a visible fake cursor, since headless video has none), TTS adapter (OpenAI / ElevenLabs / Piper / silence, 2 retries then silence), and an ffmpeg assembler with title/end cards and burned-in captions.
- Problem: local ffmpeg has no `drawtext` or `subtitles` filter. Fix: render cards and caption overlays as PNGs in Chromium and overlay them. Same output everywhere.
- 20 tests passing so far (schemas, recorder against a fixture site, TTS with mocked providers, assembly in recording + slideshow mode).
