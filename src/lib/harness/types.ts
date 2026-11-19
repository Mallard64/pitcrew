import type { Flow } from "../../../harness/schemas/flow";
import type { VideoPlan } from "../../../harness/schemas/video_plan";
import type { SiteDigest } from "../explore";
import type { Commit } from "../buildlog";
import type { RepoFacts } from "../repo";
import type { Topic } from "../sensitive";
import type { DemoMode } from "../../../harness/schemas/video_plan";

export type PlanRequest = {
  projectName: string;
  liveUrl: string;
  repoUrl?: string;
  blurb?: string;
  problem?: string;
  whatsNext?: string;
  /** Site digest of the live link; absent for GitHub-only projects. */
  digest?: SiteDigest;
  /** Public repo facts (GitHub-only projects, or a repo given next to a live link). */
  repo?: RepoFacts;
  /** Where the demo comes from; decides the mode-specific part of the request. */
  demoMode?: DemoMode;
  /** Team footage cut into clips (footage mode). */
  footageClips?: { id: string; duration_s: number }[];
  /** Keyframes of the footage clips, attached so the agent narrates what is really on screen. */
  footageFrames?: { name: string; path: string }[];
  /** README images we downloaded (repo-showcase). */
  repoImages?: { src: string; alt: string; path: string }[];
  evidence?: string;
  builtWith?: string;
  ask?: string;
  topic?: Topic | null;
  /** Agent task budget in seconds (sandbox-run needs longer than planning alone). */
  timeoutSeconds?: number;
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
      /** The demo mode the agent actually used (sandbox-run can fall back to repo-showcase). */
      demoMode?: DemoMode;
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
  /** Plain text task on the same Harness (Pitch Room). Optional: only the real planner has it. */
  task?(input: string, opts: { model?: string; timeoutSeconds: number }): Promise<{ text: string; usage?: Record<string, number> }>;
  /** Model ids the Harness allows. Optional. */
  listModels?(): Promise<string[]>;
}
