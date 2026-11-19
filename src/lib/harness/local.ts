import { planLocally, parseRevision } from "../planner/local";
import { localBuildLog } from "../buildlog";
import { localVideoPlan } from "../planner/video";
import { showcasePlan } from "../planner/showcase";
import type { PlanRequest, Planner, PlannerEvent } from "./types";

/** HARNESS_MODE=mock: plans from the site digest without any LLM. */
export class LocalPlanner implements Planner {
  readonly name = "local";

  async *plan(req: PlanRequest): AsyncIterable<PlannerEvent> {
    if (!req.digest || (req.demoMode && req.demoMode !== "live")) {
      yield { type: "log", message: "Planning from the repository and footage (offline planner)" };
      const videoPlan = showcasePlan(req);
      yield { type: "plan", flow: videoPlan.flow, videoPlan, buildLog: req.commits ? localBuildLog(req.projectName, req.commits) : undefined, source: "local", demoMode: videoPlan.demo_mode };
      return;
    }
    yield { type: "log", message: "Planning a tour from the site's own pages and copy (offline planner)" };
    const flow = planLocally(req, req.digest);
    const buildLog = req.commits ? localBuildLog(req.projectName, req.commits) : undefined;
    const videoPlan = localVideoPlan(req, flow, req.digest, seedFor(req.liveUrl));
    yield { type: "plan", flow, videoPlan, buildLog, source: "local" };
  }

  async *revise(req: PlanRequest & { request: string }): AsyncIterable<PlannerEvent> {
    if (!req.digest || (req.demoMode && req.demoMode !== "live")) {
      yield* this.plan(req);
      return;
    }
    const rev = parseRevision(req.request);
    yield { type: "log", message: `Revising (offline planner): ${JSON.stringify(rev)}` };
    const flow = planLocally(req, req.digest, rev);
    const videoPlan = localVideoPlan(req, flow, req.digest, seedFor(req.liveUrl + req.request));
    yield { type: "plan", flow, videoPlan, buildLog: req.commits ? localBuildLog(req.projectName, req.commits) : undefined, source: "local" };
  }
}

/** Stable seed from a string, so the same input reproduces the same look. */
export function seedFor(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
