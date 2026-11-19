**Type:** Build log

**Title:** Usage has no per-step breakdown, so a 154 s sandbox check costing 390k tokens is a mystery

**Building:** Pit Crew runs one agent task per pitch video, plus short follow-up turns (research, review). We need a predictable cost per video before letting hackathon teams use it for free.

**Blocked:** `response.completed` reports totals only. For example, our sandbox probe made 11 tool calls (shell, a file write, one vision call) in 154 s and reported:

```json
"usage": { "input_tokens": 390573, "output_tokens": 3643, "total_tokens": 394216 }
```

That's 107× more input than output for a short checklist. We can't tell whether it came from tool output (an `npm ci` log, a cloned file tree), re-sent context on every step, or the memory tool. Our earlier planning task was about 125k tokens. Without a breakdown we can't tell which part of our prompt or which tool use to trim.

**Cost to us:** no lost time, but we can't yet tell teams what a video costs, or which step to trim to make it cheaper.

**Loved:** usage arrives on the terminal event of the stream, with the response id, so per-job cost logging was easy.

**Want:**
- A per-step breakdown on the response (or `GET /v1/responses/{id}/usage`):
  `[{"step":3,"tool":"terminal","input_tokens":41200,"output_tokens":180,"tool_output_tokens":38900}, …]`
- Report cached vs. uncached input tokens.
- A per-task cap, e.g. `max_input_tokens`, failing with a clear error, so a runaway tool output can't burn a team's credit.

**Who benefits:** anyone shipping an agent to end users, who needs per-unit cost to set limits and pricing, and every team on a small BYOK balance.

**Labels:** The Big Hack Game, usage, observability, pricing

**Roadmap:** Related: #R?

