import type { Flow } from "../../../harness/schemas/flow";
import type { VideoPlan } from "../../../harness/schemas/video_plan";
import type { SiteDigest } from "../explore";
import type { Commit } from "../buildlog";

export type PlanRequest = {
  projectName: string;
  liveUrl: string;
  repoUrl?: string;
  blurb?: string;
  problem?: string;
  whatsNext?: string;
  digest: SiteDigest;
  commits?: Commit[];
  readme?: string;
  /** Team-chosen target length in seconds (30–180); undefined = the default 60–90s. */
  lengthS?: number;
  /** Opaque per-visitor id sent as UHP `user` (never anything the person typed). */
  user?: string;
};

export type PlannerEvent =
  | { type: "log"; message: string }
  | {
      type: "plan";
      flow: Flow;
      /** v2: the full video plan (its flow equals `flow`). */
      videoPlan?: VideoPlan;
      summary?: string;
      buildLog?: string;
      submission?: string;
      sessionId?: string;
      hrSessionId?: string;
      /** Web-search queries for statistics about the problem (the server runs them, C19). */
      researchQueries?: string[];
      /** Notes from the agent's judge pass (pitch review follow-up). */
      judgeNotes?: string[];
      source: "harness" | "local";
    };

/**
 * Plan B contract: the planner does the thinking (flow + narration + build log);
 * our server does the mechanics (record, voice, assemble).
 */
export interface Planner {
  readonly name: string;
  plan(req: PlanRequest): AsyncIterable<PlannerEvent>;
  revise(req: PlanRequest & { sessionId?: string; previous: Flow; request: string }): AsyncIterable<PlannerEvent>;
  /** Follow-up in the same agent session with server-found research candidates. Optional. */
  research?(req: { sessionId: string; prompt: string; user?: string }): AsyncIterable<PlannerEvent>;
}
