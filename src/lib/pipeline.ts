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
import { polishFootage } from "../../harness/scripts/polish_footage";
import { renderVideo } from "../../harness/scripts/render_video";
import { captionChunks, toSrt, NARRATION_LEAD_S, type Chunk } from "../../harness/captions";
import type { VideoPlan } from "../../harness/schemas/video_plan";
import type { RecordResult } from "../../harness/scripts/record_flow";
import { localVideoPlan } from "./planner/video";
import { seedFor } from "./harness/local";
import { exploreSite, type SiteDigest } from "./explore";
import { checkPublicUrl, makeRequestGuard } from "./ssrf";
import { fetchRepoFacts, type Commit } from "./buildlog";
import type { Planner, PlannerEvent, PlanRequest } from "./harness";

export const STAGES = ["opening", "planning", "recording", "narrating", "voicing", "assembling"] as const;
export type Stage = (typeof STAGES)[number];
export type PipelineEvent = { type: "progress"; step: Stage; message: string } | { type: "log"; message: string };

export type JobInput = { projectName: string; liveUrl: string; repoUrl?: string; blurb?: string; problem?: string; whatsNext?: string; user?: string };
export type PipelineResult = { contract: Contract; flow: Flow; videoPlan: VideoPlan; sessionId?: string; hrSessionId?: string; planSource: string; files: string[] };

/** Saved next to v1 so revisions don't need to re-crawl the site or GitHub. */
type Context = { digest: SiteDigest; commits?: Commit[]; readme?: string };

export const OUTPUT_FILES = ["demo.mp4", "captions.srt", "script.md", "build_log.md", "submission.md", "video_plan.json", "flow.json", "thumb.jpg"];

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

  // 2. Plan: the agent (or the offline planner) returns a full video plan.
  progress("planning", revision ? `Revising: “${revision.request}”` : "Writing the pitch and directing the video");
  const req: PlanRequest = { ...input, ...ctx };
  const events = revision ? planner.revise({ ...req, ...revision }) : planner.plan(req);
  let plan: Extract<PlannerEvent, { type: "plan" }> | undefined;
  for await (const ev of events) {
    if (ev.type === "log") log(ev.message);
    else plan = ev;
  }
  if (!plan) throw new Error("Planner returned no plan");
  // A v1 answer (flow only) still gets the pitch structure around it.
  const videoPlan: VideoPlan = plan.videoPlan ?? localVideoPlan(input, plan.flow, ctx.digest, seedFor(input.liveUrl));
  const flow = videoPlan.flow;
  await fs.writeFile(path.join(outDir, "flow.json"), JSON.stringify(flow, null, 2));
  log(`Plan: ${videoPlan.scenes.length} scenes, ${flow.steps.length} demo steps (${plan.source} planner, seed ${videoPlan.seed})`);

  // 3. Record the demo, then cut one polished clip per step.
  progress("recording", `Recording ${flow.steps.length} demo steps in Chromium`);
  const rec = await recordFlow(flow, outDir, { allowRequest: guard, log });
  log(`${rec.stepsOk}/${flow.steps.length} steps recorded`);
  if (rec.stepsOk === 0) throw new Error("No step of the demo flow worked on this site");
  let clipIds = new Set<string>();
  try {
    clipIds = new Set((await polishFootage(outDir, log)).map((c) => c.step_id));
  } catch (e) {
    log(`Clip polish failed (${(e as Error).message.slice(0, 120)}); demo scenes will use screenshots`);
  }

  // 4. Narrate: clean the plan so it only shows what we actually have and can stand behind.
  progress("narrating", "Writing the narration and captions");
  const dropped = sanitizePlan(videoPlan, clipIds, outDir);
  for (const d of dropped) log(d);
  const script = { segments: videoPlan.scenes.filter((sc) => sc.narration.trim()).map((sc) => ({ step_id: sc.id, text: sc.narration })) };
  await fs.writeFile(path.join(outDir, "script.json"), JSON.stringify(script, null, 2));
  await fs.writeFile(
    path.join(outDir, "script.md"),
    `# ${input.projectName}: pitch script\n\n${videoPlan.scenes.map((sc) => `**${sc.section}** (${sc.layout}): ${sc.narration || "_(no narration)_"}`).join("\n\n")}\n`,
  );
  if (plan.buildLog) await fs.writeFile(path.join(outDir, "build_log.md"), plan.buildLog);
  if (plan.submission) await fs.writeFile(path.join(outDir, "submission.md"), plan.submission);

  // 5. Voice each scene, then make every scene at least as long as its narration.
  const tts = ttsConfigFromEnv();
  progress("voicing", tts.provider === "none" ? "No TTS key set: captions only, silent narration" : `Voicing with ${tts.provider}`);
  const audio = await voiceScript(script, outDir, tts, { log });
  if (audio.some((a) => a.fallback)) log("Some segments fell back to silence after TTS errors");
  const audioLen = new Map(audio.map((a) => [a.step_id, a.duration_s]));
  for (const sc of videoPlan.scenes) {
    const need = (audioLen.get(sc.id) ?? 0) + NARRATION_LEAD_S + 0.5;
    if (sc.duration_s < need) sc.duration_s = Math.round(need * 10) / 10;
  }
  await fs.writeFile(path.join(outDir, "video_plan.json"), JSON.stringify(videoPlan, null, 2));
  const srt: Chunk[] = [];
  let t = 0;
  for (const sc of videoPlan.scenes) {
    const len = audioLen.get(sc.id);
    if (len) srt.push(...captionChunks(sc.narration, t + NARRATION_LEAD_S, len));
    t += sc.duration_s;
  }
  await fs.writeFile(path.join(outDir, "captions.srt"), toSrt(srt));

  // 6. Render with Remotion; if that fails, fall back to the ffmpeg editor so the team still gets a video.
  progress("assembling", "Rendering the video");
  let contract: Contract;
  try {
    contract = await renderVideo(outDir, log);
  } catch (e) {
    log(`Remotion render failed (${(e as Error).message.split("\n")[0].slice(0, 160)}); using the fallback editor`);
    contract = await legacyAssemble(input, flow, rec, outDir, log);
  }
  if (rec.stepsOk < flow.steps.length) {
    const failed = rec.timings.filter((x) => !x.ok).map((x) => `${x.step_id}: ${x.error ?? "failed"}`);
    contract.notes = [contract.notes, `failed steps: ${failed.join("; ")}`].filter(Boolean).join("; ");
    if (contract.status === "ok") contract.status = "partial";
  }
  contract.steps_ok = rec.stepsOk;
  contract.steps_total = flow.steps.length;
  // Big intermediates aren't needed once demo.mp4 exists.
  await fs.rm(path.join(outDir, "recording.webm"), { force: true });

  const files = OUTPUT_FILES.filter((f) => existsSync(path.join(outDir, f)));
  return { contract, flow, videoPlan, sessionId: plan.sessionId, hrSessionId: plan.hrSessionId, planSource: plan.source, files };
}

/**
 * Removes what we can't show truthfully: clips for steps that didn't record, scenes left empty,
 * and statistics without a verified source. Research stats stay off until our verifier exists (C19);
 * only team-provided numbers with a source entry are kept. Returns log lines for what was dropped.
 */
export function sanitizePlan(plan: VideoPlan, clipIds: Set<string>, outDir: string): string[] {
  const notes: string[] = [];
  const sourceOk = (id: string) => plan.sources.some((s) => s.id === id && s.kind === "team-provided");
  for (const sc of plan.scenes) {
    const before = sc.elements.length;
    sc.elements = sc.elements.filter((el) => {
      if (el.type === "clip" && !clipIds.has(el.step_id) && !existsSync(path.join(outDir, "shots", `${el.step_id}.png`))) return false;
      if (el.type === "stat" && !sourceOk(el.source_id)) {
        notes.push(`Dropped stat "${el.value}${el.unit ?? ""} ${el.label}" in ${sc.id}: no verified source (source checking isn't live yet)`);
        return false;
      }
      return true;
    });
    if (before && !sc.elements.length && sc.section === "demo") notes.push(`Dropped demo scene ${sc.id}: its step didn't record`);
  }
  plan.scenes = plan.scenes.filter((sc) => sc.section !== "demo" || sc.elements.length > 0);
  plan.sources = plan.sources.filter((s) => s.kind === "team-provided");
  return notes;
}

/** Fallback when Remotion fails: the original ffmpeg editor, narrated per demo step. */
async function legacyAssemble(input: JobInput, flow: Flow, rec: RecordResult, outDir: string, log: (m: string) => void): Promise<Contract> {
  const dir = path.join(outDir, ".fallback");
  await fs.mkdir(path.join(dir, "shots"), { recursive: true });
  await fs.copyFile(path.join(outDir, "recording.webm"), path.join(dir, "recording.webm"));
  await fs.copyFile(path.join(outDir, "timings.json"), path.join(dir, "timings.json"));
  for (const f of await fs.readdir(path.join(outDir, "shots"))) await fs.copyFile(path.join(outDir, "shots", f), path.join(dir, "shots", f));
  const okIds = new Set(rec.timings.filter((t) => t.ok).map((t) => t.step_id));
  const script = { segments: flow.steps.filter((s) => okIds.has(s.id)).map((s) => ({ step_id: s.id, text: s.say })) };
  await fs.writeFile(path.join(dir, "script.json"), JSON.stringify(script));
  await voiceScript(script, dir, ttsConfigFromEnv(), { log });
  const contract = await assembleVideo({ outDir: dir, title: input.projectName, url: input.liveUrl, mode: rec.stepsOk >= 3 ? "recording" : "slideshow", log });
  for (const f of ["demo.mp4", "captions.srt", "thumb.jpg"]) await fs.rename(path.join(dir, f), path.join(outDir, f)).catch(() => {});
  await fs.rm(dir, { recursive: true, force: true });
  return contract;
}
