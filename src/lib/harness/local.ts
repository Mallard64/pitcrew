import { planLocally, parseRevision } from "../planner/local";
import { localBuildLog } from "../buildlog";
import type { PlanRequest, Planner, PlannerEvent } from "./types";

/** HARNESS_MODE=mock: plans from the site digest without any LLM. */
export class LocalPlanner implements Planner {
  readonly name = "local";

  async *plan(req: PlanRequest): AsyncIterable<PlannerEvent> {
    yield { type: "log", message: "Planning a tour from the site's own pages and copy (offline planner)" };
    const flow = planLocally(req, req.digest);
    const buildLog = req.commits ? localBuildLog(req.projectName, req.commits) : undefined;
    yield { type: "plan", flow, buildLog, source: "local" };
  }

  async *revise(req: PlanRequest & { request: string }): AsyncIterable<PlannerEvent> {
    const rev = parseRevision(req.request);
    yield { type: "log", message: `Revising (offline planner): ${JSON.stringify(rev)}` };
    const flow = planLocally(req, req.digest, rev);
    yield { type: "plan", flow, buildLog: req.commits ? localBuildLog(req.projectName, req.commits) : undefined, source: "local" };
  }
}
