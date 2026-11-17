import type { Flow } from "../../../harness/schemas/flow";
import type { SiteDigest } from "../explore";
import type { Commit } from "../buildlog";

export type PlanRequest = {
  projectName: string;
  liveUrl: string;
  repoUrl?: string;
  blurb?: string;
  digest: SiteDigest;
  commits?: Commit[];
  readme?: string;
};

export type PlannerEvent =
  | { type: "log"; message: string }
  | { type: "plan"; flow: Flow; summary?: string; buildLog?: string; sessionId?: string; source: "harness" | "local" };

/**
 * Plan B contract: the planner does the thinking (flow + narration + build log);
 * our server does the mechanics (record, voice, assemble).
 */
export interface Planner {
  readonly name: string;
  plan(req: PlanRequest): AsyncIterable<PlannerEvent>;
  revise(req: PlanRequest & { sessionId?: string; previous: Flow; request: string }): AsyncIterable<PlannerEvent>;
}
