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
    try {
      let got = false;
      for await (const ev of run()) {
        if (ev.type === "plan") got = true;
        yield ev;
      }
      if (got) return;
      yield { type: "log", message: "agent returned no plan; falling back to the offline planner" } as PlannerEvent;
    } catch (e) {
      yield { type: "log", message: `agent failed (${(e as Error).message.slice(0, 200)}); falling back to the offline planner` } as PlannerEvent;
    }
    yield* fb();
  }
  plan(req: PlanRequest) {
    return this.wrap(() => this.primary.plan(req), () => this.fallback.plan(req));
  }
  revise(req: Parameters<Planner["revise"]>[0]) {
    return this.wrap(() => this.primary.revise(req), () => this.fallback.revise(req));
  }
}

export function getPlanner(env: Record<string, string | undefined> = process.env): Planner {
  if (harnessMode(env) === "mock") return new LocalPlanner();
  const { HARNESSROUTER_BASE_URL, HARNESSROUTER_API_KEY, HARNESS_ID, HARNESS_MODEL } = env;
  if (!HARNESSROUTER_BASE_URL || !HARNESSROUTER_API_KEY || !HARNESS_ID)
    throw new Error("HARNESS_MODE=real needs HARNESSROUTER_BASE_URL, HARNESSROUTER_API_KEY and HARNESS_ID");
  return new FallbackPlanner(
    new HarnessRouterPlanner({ baseUrl: HARNESSROUTER_BASE_URL, apiKey: HARNESSROUTER_API_KEY, harnessId: HARNESS_ID, model: HARNESS_MODEL || undefined }),
    new LocalPlanner(),
  );
}
