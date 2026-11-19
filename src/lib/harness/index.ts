import { LocalPlanner } from "./local";
import { HarnessRouterPlanner } from "./real";
import type { PlanRequest, Planner, PlannerEvent } from "./types";

export type { Planner, PlannerEvent, PlanRequest } from "./types";

export function harnessMode(env: Record<string, string | undefined> = process.env): "mock" | "real" {
  return env.HARNESS_MODE === "real" ? "real" : "mock";
}

/**
 * Real mode wraps HarnessRouter with a fallback: if the agent errors or returns an invalid plan,
 * the job still finishes using the local planner (and the log says so).
 */
class FallbackPlanner implements Planner {
  readonly name: string;
  constructor(private primary: Planner, private fallback: Planner) {
    this.name = primary.name;
  }
  private async *wrap(run: () => AsyncIterable<PlannerEvent>, fb: () => AsyncIterable<PlannerEvent>) {
    // One retry when the model provider is rate-limited (429 / "too many requests"): it usually clears in seconds.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let got = false;
        for await (const ev of run()) {
          if (ev.type === "plan") got = true;
          yield ev;
        }
        if (got) return;
        yield { type: "log", message: "agent returned no plan; falling back to the offline planner" } as PlannerEvent;
        break;
      } catch (e) {
        const msg = (e as Error).message;
        if (attempt === 0 && /\b429\b|too many requests|rate.?limit/i.test(msg)) {
          yield { type: "log", message: "The model provider is busy (rate limit); retrying the agent in 30 s" } as PlannerEvent;
          await new Promise((r) => setTimeout(r, Number(process.env.AGENT_RETRY_MS ?? 30000)));
          continue;
        }
        yield { type: "log", message: `agent failed (${msg.slice(0, 200)}); falling back to the offline planner` } as PlannerEvent;
        break;
      }
    }
    yield* fb();
  }
  plan(req: PlanRequest) {
    return this.wrap(() => this.primary.plan(req), () => this.fallback.plan(req));
  }
  revise(req: Parameters<Planner["revise"]>[0]) {
    return this.wrap(() => this.primary.revise(req), () => this.fallback.revise(req));
  }
  // No offline fallback: if the research turn fails, the plan simply keeps its problem scene without stats.
  research(req: { sessionId: string; prompt: string; user?: string }) {
    if (!this.primary.research) throw new Error("planner has no research step");
    return this.primary.research(req);
  }
  // Pitch Room: no fallback here either; the room itself falls back to the normal script.
  task(input: string, opts: { model?: string; timeoutSeconds: number }) {
    if (!this.primary.task) throw new Error("planner has no task step");
    return this.primary.task(input, opts);
  }
  listModels() {
    return this.primary.listModels ? this.primary.listModels() : Promise.resolve([]);
  }
}

export function getPlanner(env: Record<string, string | undefined> = process.env): Planner {
  if (harnessMode(env) === "mock") return new LocalPlanner();
  const apiKey = env.HR_API_KEY || env.HARNESSROUTER_API_KEY;
  const harnessId = env.HARNESS_ID;
  if (!apiKey || !harnessId) throw new Error("HARNESS_MODE=real needs HR_API_KEY and HARNESS_ID");
  // The model is configured on the Harness; HARNESS_MODEL only overrides it per task when set.
  return new FallbackPlanner(
    new HarnessRouterPlanner({ baseUrl: env.HARNESSROUTER_BASE_URL || undefined, apiKey, harnessId, model: env.HARNESS_MODEL || undefined }),
    new LocalPlanner(),
  );
}
