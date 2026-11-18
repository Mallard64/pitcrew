/**
 * One job version, end to end: open site -> plan -> record -> narrate -> voice -> assemble.
 * Writes everything into outDir (data/jobs/<id>/v<n>/).
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Flow } from "../../harness/schemas/flow";
import type { Contract } from "../../harness/schemas/contract";
import { recordFlow } from "../../harness/scripts/record_flow";
import { voiceScript, ttsConfigFromEnv } from "../../harness/scripts/tts";
import { assembleVideo } from "../../harness/scripts/assemble";
import { exploreSite, type SiteDigest } from "./explore";
import { checkPublicUrl, makeRequestGuard } from "./ssrf";
import { fetchRepoFacts, type Commit } from "./buildlog";
import type { Planner, PlannerEvent, PlanRequest } from "./harness";

export const STAGES = ["opening", "planning", "recording", "narrating", "voicing", "assembling"] as const;
export type Stage = (typeof STAGES)[number];
export type PipelineEvent = { type: "progress"; step: Stage; message: string } | { type: "log"; message: string };

export type JobInput = { projectName: string; liveUrl: string; repoUrl?: string; blurb?: string; user?: string };
export type PipelineResult = { contract: Contract; flow: Flow; sessionId?: string; hrSessionId?: string; planSource: string; files: string[] };

/** Saved next to v1 so revisions don't need to re-crawl the site or GitHub. */
type Context = { digest: SiteDigest; commits?: Commit[]; readme?: string };

export const OUTPUT_FILES = ["demo.mp4", "captions.srt", "script.md", "build_log.md", "flow.json", "thumb.jpg"];

export async function runPipeline(
  input: JobInput,
  jobDir: string,
  version: number,
  emit: (e: PipelineEvent) => void,
  planner: Planner,
  revision?: { request: string; previous: Flow; sessionId?: string },
): Promise<PipelineResult> {
  const outDir = path.join(jobDir, `v${version}`);
  await fs.mkdir(outDir, { recursive: true });
  const log = (message: string) => emit({ type: "log", message });
  const progress = (step: Stage, message: string) => emit({ type: "progress", step, message });
  const guard = makeRequestGuard();

  // 1. Open the site (and the repo), or reuse what v1 collected.
  progress("opening", revision ? "Reusing the site snapshot from the first run" : `Opening ${input.liveUrl}`);
  const ctxFile = path.join(jobDir, "context.json");
  let ctx: Context;
  if (revision && existsSync(ctxFile)) {
    ctx = JSON.parse(await fs.readFile(ctxFile, "utf8"));
  } else {
    const check = await checkPublicUrl(input.liveUrl);
    if (!check.ok) throw new Error(`Can't open that URL: ${check.reason}`);
    let digest: SiteDigest;
    try {
      digest = await exploreSite(input.liveUrl, { allowRequest: guard, log });
    } catch (e) {
      throw new Error(`Couldn't load ${input.liveUrl}: ${(e as Error).message.split("\n")[0]}`);
    }
    log(`Found ${digest.home.sections.length} sections and ${digest.pages.length} extra pages`);
    ctx = { digest };
    if (input.repoUrl) {
      try {
        const facts = await fetchRepoFacts(input.repoUrl);
        ctx.commits = facts.commits;
        ctx.readme = facts.readme;
        log(`Read ${facts.commits.length} commits from ${input.repoUrl}`);
      } catch (e) {
        log(`Skipping build log: ${(e as Error).message}`);
      }
    }
    await fs.writeFile(ctxFile, JSON.stringify(ctx));
  }

  // 2. Plan.
  progress("planning", revision ? `Revising: “${revision.request}”` : "Planning the demo flow");
  const req: PlanRequest = { ...input, ...ctx };
  const events = revision ? planner.revise({ ...req, ...revision }) : planner.plan(req);
  let plan: Extract<PlannerEvent, { type: "plan" }> | undefined;
  for await (const ev of events) {
    if (ev.type === "log") log(ev.message);
    else plan = ev;
  }
  if (!plan) throw new Error("Planner returned no plan");
  const flow = plan.flow;
  await fs.writeFile(path.join(outDir, "flow.json"), JSON.stringify(flow, null, 2));
  log(`Plan: ${flow.steps.length} steps (${plan.source} planner)`);

  // 3. Record.
  progress("recording", `Recording ${flow.steps.length} steps in Chromium`);
  const rec = await recordFlow(flow, outDir, { allowRequest: guard, log });
  log(`${rec.stepsOk}/${flow.steps.length} steps recorded`);
  if (rec.stepsOk === 0) throw new Error("No step of the demo flow worked on this site");
  const shots = flow.steps.filter((s) => existsSync(path.join(outDir, "shots", `${s.id}.png`))).length;
  const mode = rec.stepsOk >= 3 || shots < 3 ? "recording" : "slideshow";
  if (mode === "slideshow") log("Fewer than 3 steps recorded cleanly; switching to slideshow mode");

  // 4. Narrate: one segment per step that made it.
  progress("narrating", "Writing the narration and captions");
  const okIds = new Set(rec.timings.filter((t) => t.ok).map((t) => t.step_id));
  const kept = flow.steps.filter((s) => (mode === "recording" ? okIds.has(s.id) : existsSync(path.join(outDir, "shots", `${s.id}.png`))));
  const script = { segments: kept.map((s) => ({ step_id: s.id, text: s.say })) };
  await fs.writeFile(path.join(outDir, "script.json"), JSON.stringify(script, null, 2));
  await fs.writeFile(
    path.join(outDir, "script.md"),
    `# ${input.projectName}: demo script\n\n${kept.map((s, i) => `${i + 1}. **${s.action}${s.url ? ` ${s.url}` : ""}${s.selector ? ` \`${s.selector}\`` : ""}**: ${s.say}`).join("\n")}\n`,
  );
  if (plan.buildLog) await fs.writeFile(path.join(outDir, "build_log.md"), plan.buildLog);

  // 5. Voice.
  const tts = ttsConfigFromEnv();
  progress("voicing", tts.provider === "none" ? "No TTS key set: captions only, silent narration" : `Voicing with ${tts.provider}`);
  const audio = await voiceScript(script, outDir, tts, { log });
  if (audio.some((a) => a.fallback)) log("Some segments fell back to silence after TTS errors");

  // 6. Assemble.
  progress("assembling", `Editing the video (${mode})`);
  const contract = await assembleVideo({ outDir, title: input.projectName, url: input.liveUrl, mode, log });
  if (rec.stepsOk < flow.steps.length) {
    const failed = rec.timings.filter((t) => !t.ok).map((t) => `${t.step_id}: ${t.error ?? "failed"}`);
    contract.notes = [contract.notes, `failed steps: ${failed.join("; ")}`].filter(Boolean).join("; ");
    contract.steps_total = flow.steps.length;
    if (contract.status === "ok") contract.status = "partial";
  }
  // Big intermediates aren't needed once demo.mp4 exists.
  await fs.rm(path.join(outDir, "recording.webm"), { force: true });

  const files = OUTPUT_FILES.filter((f) => existsSync(path.join(outDir, f)));
  return { contract, flow, sessionId: plan.sessionId, hrSessionId: plan.hrSessionId, planSource: plan.source, files };
}
