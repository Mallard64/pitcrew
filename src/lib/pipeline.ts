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
import type { DemoMode, VideoPlan } from "../../harness/schemas/video_plan";
import type { RecordResult } from "../../harness/scripts/record_flow";
import { localVideoPlan } from "./planner/video";
import { showcasePlan } from "./planner/showcase";
import { downloadRepoImages, fetchRepo, fillCodeLines, type RepoFacts, type RepoKind } from "./repo";
import { fetchSandboxRecording } from "./sandbox";
import { checkSensitive, detectTopic, DISCLAIMER, scrubSensitive, sensitivePrompt, type Topic } from "./sensitive";
import { prepareFootage } from "../../harness/scripts/footage";
import { mergeRepairedSteps, repairableFailures, repairPrompt } from "./repair";
import { seedFor } from "./harness/local";
import { exploreSite, type SiteDigest } from "./explore";
import { checkPublicUrl, makeRequestGuard } from "./ssrf";
import { fetchRepoFacts, type Commit } from "./buildlog";
import { scrubUnbackedNumbers, sourcesMarkdown, verifyResearch } from "./research/verify";
import { braveSearch, findCandidates, researchPrompt } from "./research/search";
import { choosePace, lengthWindow } from "./pacing";
import { checkPitch, judgePrompt, mergeJudgeRewrite, pitchCheckMarkdown, type PitchReport } from "./pitchcheck";
import { resolveVoice, VOICES, LOOK_IDS } from "./voices";
import { resolveKit } from "../../remotion/kits/default";
import type { Planner, PlannerEvent, PlanRequest } from "./harness";

export const STAGES = ["opening", "planning", "recording", "narrating", "voicing", "assembling"] as const;
export type Stage = (typeof STAGES)[number];
export type PipelineEvent = { type: "progress"; step: Stage; message: string } | { type: "log"; message: string };

export type JobInput = {
  projectName: string; liveUrl: string; repoUrl?: string; blurb?: string; problem?: string; whatsNext?: string; user?: string;
  /** Team choices: narrator voice key, forced look, and whether to pause for a script review. */
  voice?: string; look?: string; reviewScript?: boolean;
  /** Target length in seconds (30–180); undefined = the default 90–120s. */
  lengthS?: number;
  /** Show demo steps as magnified close-ups of the UI panel they touch. */
  closeups?: boolean;
  /** Outline fields from the form. */
  evidence?: string; builtWith?: string; ask?: string;
  /** Local path of the team's uploaded footage (footage mode). */
  footagePath?: string;
};
/** What the team sees while the job waits for their script review. */
export type ReviewDraft = { scenes: { id: string; section: string; narration: string }[]; report: PitchReport; voice: string; look: string };
export type PipelineHooks = {
  awaitReview?: (draft: ReviewDraft) => Promise<{ id: string; narration: string }[] | null>;
  /** Adds working time to the job's timeout (used when failed demo steps are repaired and re-recorded). */
  extendBudget?: (ms: number) => void;
  /** Shows the demo mode (and a note for the team) on the job page while the job runs. */
  onMeta?: (m: { demo_mode: DemoMode; notice: string | null }) => void;
};

/** sandbox-run installs and starts the repo before planning: give the job more time. */
const SANDBOX_EXTRA_MS = 12 * 60 * 1000;

export const DEMO_MODE_LABEL: Record<DemoMode, string> = {
  live: "the live site, recorded in Chromium",
  "sandbox-run": "the repo, run and recorded in a HarnessRouter sandbox",
  "cli-run": "the repo's CLI, run in a HarnessRouter sandbox",
  footage: "your uploaded footage",
  "repo-showcase": "the repository (screenshots, code and diagram; nothing is run)",
};

/**
 * Footage beats everything (it's what the team chose to show); then a live link; then running a web
 * repo in the sandbox; otherwise a repository showcase. Games are never built from source.
 */
export function chooseDemoMode(o: { footage: boolean; liveUrl?: string; kind?: RepoKind }): DemoMode {
  if (o.footage) return "footage";
  if (o.liveUrl) return "live";
  if ((o.kind === "web" || o.kind === "python-web") && process.env.SANDBOX_RUN !== "0") return "sandbox-run";
  return "repo-showcase";
}

/** Repair failed steps only if the job is young enough that a second recording still fits comfortably. */
const REPAIR_IF_BEFORE_MS = 6 * 60 * 1000;
const REPAIR_EXTRA_MS = 4 * 60 * 1000;
export type PipelineResult = { contract: Contract; flow: Flow; videoPlan: VideoPlan; sessionId?: string; hrSessionId?: string; planSource: string; files: string[]; demoMode: DemoMode; notice?: string };

/** Saved next to v1 so revisions don't need to re-crawl the site or GitHub. */
type Context = {
  mode: DemoMode;
  liveUrl?: string;
  digest?: SiteDigest;
  commits?: Commit[];
  readme?: string;
  repo?: RepoFacts;
  topic?: Topic | null;
  notice?: string;
  footageClips?: { id: string; duration_s: number }[];
  repoImages?: { src: string; alt: string; path: string }[];
};

export const OUTPUT_FILES = ["demo.mp4", "captions.srt", "script.md", "build_log.md", "submission.md", "video_plan.json", "sources.md", "flow.json", "thumb.jpg", "pitch_check.md", "pitch_check.json"];

export async function runPipeline(
  input: JobInput,
  jobDir: string,
  version: number,
  emit: (e: PipelineEvent) => void,
  planner: Planner,
  revision?: { request: string; previous: Flow; sessionId?: string },
  hooks: PipelineHooks = {},
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const outDir = path.join(jobDir, `v${version}`);
  await fs.mkdir(outDir, { recursive: true });
  const log = (message: string) => emit({ type: "log", message });
  const progress = (step: Stage, message: string) => emit({ type: "progress", step, message });
  const guard = makeRequestGuard();

  // 1. Collect what we can show: the live site, the repo (read-only), the team's footage, or a mix.
  progress("opening", revision ? "Reusing what the first run collected" : input.liveUrl ? `Opening ${input.liveUrl}` : `Reading ${input.repoUrl}`);
  const ctxFile = path.join(jobDir, "context.json");
  const assetsDir = path.join(jobDir, "assets");
  let ctx: Context;
  if (revision && existsSync(ctxFile)) {
    ctx = JSON.parse(await fs.readFile(ctxFile, "utf8"));
  } else {
    ctx = { mode: "live", liveUrl: input.liveUrl };
    if (input.repoUrl) {
      try {
        ctx.repo = await fetchRepo(input.repoUrl);
        log(`Read the repo: ${ctx.repo.stack.join(", ") || ctx.repo.kind}, ${ctx.repo.tree.length} files`);
      } catch (e) {
        if (!input.liveUrl) throw new Error(`Couldn't read ${input.repoUrl}: ${(e as Error).message}`);
        log(`Skipping repo details: ${(e as Error).message}`);
      }
    }
    // A game with a browser build linked from its README is demoed live from that link.
    if (!ctx.liveUrl && ctx.repo?.playableUrl && (await checkPublicUrl(ctx.repo.playableUrl)).ok) {
      ctx.liveUrl = ctx.repo.playableUrl;
      log(`Found a playable build at ${ctx.liveUrl}`);
    }
    ctx.mode = chooseDemoMode({ footage: !!input.footagePath, liveUrl: ctx.liveUrl, kind: ctx.repo?.kind });
    if (ctx.mode === "repo-showcase" && ctx.repo?.kind.startsWith("game-"))
      ctx.notice = "This video is built from your repo's screenshots and code. Upload 30 seconds of gameplay (MP4 or MOV) for a much better video.";
    if (ctx.liveUrl) {
      const check = await checkPublicUrl(ctx.liveUrl);
      if (!check.ok) throw new Error(`Can't open that URL: ${check.reason}`);
      try {
        ctx.digest = await exploreSite(ctx.liveUrl, { allowRequest: guard, log });
      } catch (e) {
        if (ctx.mode === "live") throw new Error(`Couldn't load ${ctx.liveUrl}: ${(e as Error).message.split("\n")[0]}`);
        log(`Couldn't load ${ctx.liveUrl}; continuing from the repo`);
      }
      if (ctx.digest) log(`Found ${ctx.digest.home.sections.length} sections and ${ctx.digest.pages.length} extra pages`);
    }
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
    ctx.topic = detectTopic([input.blurb, input.problem, ctx.repo?.description, ctx.repo?.readme.text, ctx.digest?.home.description, ctx.digest?.home.h1].filter(Boolean).join("\n"));
    if (ctx.topic) log(`Sensitive topic (${ctx.topic}): stricter claim rules and an on-screen "${DISCLAIMER[ctx.topic]}"`);
    // Demo assets that don't need the agent: the team's footage, the repo's README images.
    if (input.footagePath) {
      progress("recording", "Cutting your footage into demo clips");
      ctx.footageClips = (await prepareFootage(input.footagePath, assetsDir, 60, log)).map((c) => ({ id: c.step_id, duration_s: c.duration_s }));
    }
    if (ctx.repo && ctx.mode !== "live") ctx.repoImages = await downloadRepoImages(ctx.repo, assetsDir);
    await fs.writeFile(ctxFile, JSON.stringify(ctx));
  }
  const mode0 = ctx.mode;
  log(`Demo source: ${DEMO_MODE_LABEL[mode0]}`);
  hooks.onMeta?.({ demo_mode: mode0, notice: ctx.notice ?? null });
  if (mode0 === "sandbox-run") hooks.extendBudget?.(SANDBOX_EXTRA_MS);

  // 2. Plan: the agent (or the offline planner) returns a full video plan.
  progress("planning", revision ? `Revising: “${revision.request}”` : mode0 === "sandbox-run" ? "Running the repo in a sandbox, then directing the video" : "Writing the pitch and directing the video");
  const req: PlanRequest = {
    ...input,
    liveUrl: ctx.liveUrl ?? "",
    digest: ctx.digest,
    commits: ctx.commits,
    readme: ctx.readme,
    repo: ctx.repo,
    demoMode: mode0,
    footageClips: ctx.footageClips,
    repoImages: ctx.repoImages,
    topic: ctx.topic,
    ...(mode0 === "sandbox-run" ? { timeoutSeconds: 1500 } : {}),
  };
  const events = revision ? planner.revise({ ...req, ...revision }) : planner.plan(req);
  let plan: Extract<PlannerEvent, { type: "plan" }> | undefined;
  for await (const ev of events) {
    if (ev.type === "log") log(ev.message);
    else plan = ev;
  }
  if (!plan) throw new Error("Planner returned no plan");
  // A v1 answer (flow only) still gets the pitch structure around it.
  let videoPlan: VideoPlan = plan.videoPlan ?? localVideoPlan(input, plan.flow, ctx.digest, seedFor(ctx.liveUrl || input.repoUrl || ""));
  // sandbox-run may fall back to a repo showcase when the project won't install or start.
  let mode: DemoMode = mode0 === "sandbox-run" && plan.demoMode === "repo-showcase" ? "repo-showcase" : mode0;
  if (mode !== mode0) log("The repo didn't run in the sandbox; building the demo from the repository instead");
  if (input.look && LOOK_IDS.includes(input.look) && videoPlan.style_kit !== input.look) {
    log(`Using the ${input.look} look you picked (the agent suggested ${videoPlan.style_kit})`);
    videoPlan.style_kit = input.look;
  }
  const server = { demoMode: mode, disclaimer: ctx.topic ? DISCLAIMER[ctx.topic] : undefined };
  applyTeamChoices(videoPlan, input, log, server);
  let flow = videoPlan.flow;
  await fs.writeFile(path.join(outDir, "flow.json"), JSON.stringify(flow, null, 2));
  log(`Plan: ${videoPlan.scenes.length} scenes${mode === "live" || mode === "sandbox-run" ? `, ${flow.steps.length} demo steps` : ""} (${plan.source} planner, seed ${videoPlan.seed})`);

  // 2b. Research (C19) runs while the demo records: search, collect candidate stats, let the agent pick.
  const research = researchProblemStats(planner, plan, input, log).catch((e) => {
    log(`Research skipped: ${(e as Error).message.slice(0, 160)}`);
    return null;
  });

  // 3. The demo: record the live site, fetch the sandbox recording, or use footage / repo assets.
  let rec: RecordResult = { timings: [], videoPath: "", stepsOk: 0 };
  let clipIds = new Set<string>();
  let polishNote = "";
  const copyAssets = async (dir: string) => {
    if (existsSync(path.join(assetsDir, dir))) await fs.cp(path.join(assetsDir, dir), path.join(outDir, dir), { recursive: true });
  };
  if (mode === "live") {
    const live = await recordLive();
    rec = live.rec;
    clipIds = live.clipIds;
    polishNote = live.polishNote;
  } else if (mode === "sandbox-run") {
    progress("recording", "Downloading the recording made in the sandbox");
    try {
      if (!plan.hrSessionId) throw new Error("no sandbox session");
      rec = await fetchSandboxRecording(plan.hrSessionId, outDir);
      log(`${rec.stepsOk}/${flow.steps.length} steps recorded in the sandbox`);
      if (!rec.stepsOk) throw new Error("no step recorded");
      clipIds = new Set((await polishFootage(outDir, log, { lite: true })).map((c) => c.step_id));
    } catch (e) {
      log(`Sandbox recording unusable (${(e as Error).message.slice(0, 160)}); building the demo from the repository instead`);
      mode = server.demoMode = "repo-showcase";
      const fallback = showcasePlan({ ...req, demoMode: "repo-showcase", footageClips: undefined });
      const demo = fallback.scenes.filter((sc) => sc.section === "demo");
      const at = videoPlan.scenes.findIndex((sc) => sc.section === "demo");
      videoPlan.scenes = videoPlan.scenes.filter((sc) => sc.section !== "demo");
      videoPlan.scenes.splice(at < 0 ? 1 : at, 0, ...demo);
      applyTeamChoices(videoPlan, input, undefined, server);
    }
  } else if (mode === "footage") {
    await copyAssets("clips");
    await copyAssets("shots");
    clipIds = new Set((ctx.footageClips ?? []).map((c) => c.id));
    rec = { timings: (ctx.footageClips ?? []).map((c) => ({ step_id: c.id, ok: true, start_ms: 0, end_ms: c.duration_s * 1000 })), videoPath: "", stepsOk: clipIds.size };
  }
  if (mode === "repo-showcase" || mode === "footage") {
    await copyAssets("repo");
    if (ctx.repo) for (const n of await fillCodeLines(videoPlan.scenes, ctx.repo)) log(n);
  }
  hooks.onMeta?.({ demo_mode: mode, notice: ctx.notice ?? null });

  // Record the live site, repair failed steps once, then cut one polished clip per step.
  async function recordLive(): Promise<{ rec: RecordResult; clipIds: Set<string>; polishNote: string }> {
  progress("recording", `Recording ${flow.steps.length} demo steps in Chromium`);
  let rec = await recordFlow(flow, outDir, { allowRequest: guard, log });
  log(`${rec.stepsOk}/${flow.steps.length} steps recorded`);

  // 3a. Repair: failed clicks/types go back to the agent with the elements that really were on the
  // page; it fixes only those selectors and we record once more, keeping whichever take is better.
  const failures = repairableFailures(flow, rec.timings);
  const agent = plan!;
  if (failures.length && planner.research && agent.sessionId && agent.source === "harness" && Date.now() - startedAt < REPAIR_IF_BEFORE_MS) {
    hooks.extendBudget?.(REPAIR_EXTRA_MS);
    progress("recording", `Fixing ${failures.length} demo step${failures.length === 1 ? "" : "s"} that didn't work on the live site`);
    try {
      let fixed: Extract<PlannerEvent, { type: "plan" }> | undefined;
      for await (const ev of planner.research({ sessionId: agent.sessionId, prompt: repairPrompt(failures), user: input.user })) {
        if (ev.type === "log") log(ev.message);
        else fixed = ev;
      }
      const merged = fixed ? mergeRepairedSteps(flow, fixed.flow, failures.map((f) => f.step.id)) : { flow, changed: 0 };
      if (!merged.changed) log("The agent found no better selectors; keeping the first recording");
      else {
        log(`Recording again with ${merged.changed} fixed step${merged.changed === 1 ? "" : "s"}`);
        const retryDir = path.join(outDir, "retake");
        const rec2 = await recordFlow(merged.flow, retryDir, { allowRequest: guard, log });
        if (rec2.stepsOk > rec.stepsOk) {
          for (const f of ["shots", "timings.json", "recording.mp4"]) {
            await fs.rm(path.join(outDir, f), { recursive: true, force: true });
            if (existsSync(path.join(retryDir, f))) await fs.rename(path.join(retryDir, f), path.join(outDir, f));
          }
          rec = { ...rec2, videoPath: rec2.videoPath ? path.join(outDir, "recording.mp4") : "" };
          flow = videoPlan.flow = merged.flow;
          await fs.writeFile(path.join(outDir, "flow.json"), JSON.stringify(flow, null, 2));
          log(`${rec.stepsOk}/${flow.steps.length} steps recorded after the fix`);
        } else log(`The retake recorded ${rec2.stepsOk}/${flow.steps.length}; keeping the first recording`);
        await fs.rm(retryDir, { recursive: true, force: true });
      }
    } catch (e) {
      log(`Step repair skipped: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  if (rec.stepsOk === 0) throw new Error("No step of the demo flow worked on this site");
  let clipIds = new Set<string>();
  let polishNote = "";
  try {
    clipIds = new Set((await polishFootage(outDir, log)).map((c) => c.step_id));
  } catch (e) {
    // Usually the host killed ffmpeg (memory). One retry with fewer encoder threads uses less of it.
    log(`Clip polish failed (${(e as Error).message.slice(0, 120)}); retrying with fewer threads`);
    const threads = process.env.FFMPEG_THREADS;
    process.env.FFMPEG_THREADS = "2";
    try {
      clipIds = new Set((await polishFootage(outDir, log)).map((c) => c.step_id));
      log("Clip polish worked on the retry");
    } catch (e2) {
      log(`Clip polish failed again (${(e2 as Error).message.slice(0, 160)}); trying the low-memory path (1080p clips)`);
      try {
        clipIds = new Set((await polishFootage(outDir, log, { lite: true })).map((c) => c.step_id));
        log("Low-memory clip polish worked");
      } catch (e3) {
        polishNote = "demo shows screenshots: the recorded clips could not be processed";
        log(`Clip polish failed (${(e3 as Error).message.slice(0, 160)}); demo scenes will use screenshots`);
      }
    } finally {
      if (threads === undefined) delete process.env.FFMPEG_THREADS;
      else process.env.FFMPEG_THREADS = threads;
    }
  }
  return { rec, clipIds, polishNote };
  }

  // Merge research: only the problem scene(s) and sources may change; the recorded flow stays as is.
  const researched = await research;
  if (researched) {
    const newProblem = researched.videoPlan.scenes.filter((sc) => sc.section === "problem");
    if (newProblem.length) {
      const rest = videoPlan.scenes.filter((sc) => sc.section !== "problem");
      videoPlan.scenes = [...newProblem, ...rest];
      videoPlan.sources = researched.videoPlan.sources;
      if (researched.sessionId) plan.sessionId = researched.sessionId;
      log(`Research: the agent proposed ${videoPlan.sources.filter((s) => s.kind === "research").length} statistic(s)`);
    }
  }

  // 3b. Judge pass: the agent rereads its script as a hackathon judge and rewrites only the words.
  // Kept only if our rule checks score at least as well; numbers are re-checked below either way.
  let report = checkPitch(videoPlan, input.projectName);
  log(`Pitch check: ${report.score}/${report.total}${report.score < report.total ? ` (to fix: ${report.checks.filter((c) => !c.ok).map((c) => c.id).join(", ")})` : ""}`);
  if (planner.research && plan.sessionId && plan.source === "harness") {
    progress("narrating", "Reviewing the pitch the way a judge would");
    try {
      let judged: Extract<PlannerEvent, { type: "plan" }> | undefined;
      for await (const ev of planner.research({ sessionId: plan.sessionId, prompt: judgePrompt(videoPlan, report, input.projectName), user: input.user })) {
        if (ev.type === "log") log(ev.message);
        else judged = ev;
      }
      if (judged?.videoPlan) {
        const merged = mergeJudgeRewrite(videoPlan, judged.videoPlan);
        const after = checkPitch(merged, input.projectName);
        const notes = judged.judgeNotes ?? [];
        if (after.score >= report.score) {
          videoPlan = merged;
          report = { ...after, judge: { notes, rewritten: true } };
          if (judged.sessionId) plan.sessionId = judged.sessionId;
          log(`Judge pass applied: pitch check ${after.score}/${after.total}`);
        } else {
          report = { ...report, judge: { notes, rewritten: false } };
          log(`Judge pass scored lower (${after.score}/${after.total}); keeping the first script`);
        }
      }
    } catch (e) {
      log(`Judge pass skipped: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  // 4. Narrate: clean the plan so it only shows what we actually have and can stand behind.
  progress("narrating", "Writing the narration and captions");
  if (videoPlan.sources.some((s) => s.kind === "research")) progress("narrating", "Checking every statistic against its source page");
  for (const n of await verifyResearch(videoPlan)) log(n);
  const dropped = sanitizePlan(videoPlan, clipIds, outDir);
  for (const d of dropped) log(d);
  // Research and judge merges rebuild the plan; the team's choices and server fields still hold.
  applyTeamChoices(videoPlan, input, undefined, server);
  // Sensitive topics: the plan must not claim to treat/diagnose/replace professionals or promise outcomes.
  if (ctx.topic) await enforceSensitive(videoPlan, ctx.topic, planner, plan, input, log);

  // 4b. Human in the loop: the team reads (and can edit) the narration before it's voiced.
  const kitId = resolveKit(videoPlan.style_kit, videoPlan.seed, videoPlan.brand.primary).id;
  const voiceKey = resolveVoice(input.voice, kitId);
  if (input.reviewScript && hooks.awaitReview) {
    progress("narrating", "Waiting for your script review");
    const edits = await hooks.awaitReview({
      scenes: videoPlan.scenes.filter((sc) => sc.section !== "end").map((sc) => ({ id: sc.id, section: sc.section, narration: sc.narration })),
      report: { ...checkPitch(videoPlan, input.projectName), judge: report.judge },
      voice: voiceKey,
      look: kitId,
    });
    if (edits?.length) {
      let changed = 0;
      for (const e of edits) {
        const sc = videoPlan.scenes.find((x) => x.id === e.id);
        if (sc && sc.section !== "end" && sc.narration !== e.narration.trim()) {
          sc.narration = e.narration.trim();
          changed++;
        }
      }
      log(changed ? `You edited ${changed} scene${changed === 1 ? "" : "s"}` : "Script approved as written");
      // The team's words get the same rules as the agent's: no number without a source, no medical claims.
      for (const d of sanitizePlan(videoPlan, clipIds, outDir)) log(d);
      if (ctx.topic) {
        const n = scrubSensitive(videoPlan, ctx.topic);
        if (n) log(`Removed ${n} edited line${n === 1 ? "" : "s"} that broke the ${ctx.topic} rules`);
      }
    } else log("Continuing with the script as written");
  }
  report = { ...checkPitch(videoPlan, input.projectName), judge: report.judge };
  await fs.writeFile(path.join(outDir, "pitch_check.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(outDir, "pitch_check.md"), pitchCheckMarkdown(input.projectName, report));
  await fs.writeFile(path.join(outDir, "sources.md"), sourcesMarkdown(input.projectName, videoPlan.sources));
  // Pace: read a long script a bit faster and a short one a bit slower so the video lands in its window.
  const pace = choosePace(videoPlan.scenes, lengthWindow(input.lengthS));
  log(`Voice pace ${pace.base}× (estimated length ${pace.estimate}s)`);
  const script = {
    segments: videoPlan.scenes.filter((sc) => sc.narration.trim()).map((sc) => ({ step_id: sc.id, text: sc.narration, pace: pace.perScene.get(sc.id) })),
  };
  await fs.writeFile(path.join(outDir, "script.json"), JSON.stringify(script, null, 2));
  await fs.writeFile(
    path.join(outDir, "script.md"),
    `# ${input.projectName}: pitch script\n\n${videoPlan.scenes.map((sc) => `**${sc.section}** (${sc.layout}): ${sc.narration || "_(no narration)_"}`).join("\n\n")}\n`,
  );
  if (plan.buildLog) await fs.writeFile(path.join(outDir, "build_log.md"), plan.buildLog);
  if (plan.submission) await fs.writeFile(path.join(outDir, "submission.md"), plan.submission);

  // 5. Voice each scene, then make every scene at least as long as its narration.
  const tts = ttsConfigFromEnv();
  const voice = VOICES[voiceKey];
  // A team's pick always wins; on "auto" an operator's TTS_VOICE still applies, else the look's voice.
  const useKey = !!input.voice || !tts.voice;
  if (useKey && tts.provider === "elevenlabs") tts.voice = voice.elevenlabs;
  else if (useKey && tts.provider === "openai") tts.voice = voice.openai;
  progress("voicing", tts.provider === "none" ? "No TTS key set: captions only, silent narration" : useKey ? `Voicing with ${voice.label} (${voice.tone.toLowerCase()})` : `Voicing with ${tts.provider}`);
  const audio = await voiceScript(script, outDir, tts, { log });
  if (audio.some((a) => a.fallback)) log("Some segments fell back to silence after TTS errors");
  const audioLen = new Map(audio.map((a) => [a.step_id, a.duration_s]));
  // Fit every scene to its narration: the agent's planned durations assume a slower voice and left
  // seconds of dead air. Demo scenes keep a floor so the on-screen action still plays.
  for (const sc of videoPlan.scenes) sc.duration_s = fitSceneDuration(sc, audioLen.get(sc.id));
  // The team's footage is the demo: let each clip play out (up to 12 s), not just the narration.
  if (mode === "footage") {
    const clipLen = new Map((ctx.footageClips ?? []).map((c) => [c.id, c.duration_s]));
    for (const sc of videoPlan.scenes) {
      const clip = sc.elements.find((e) => e.type === "clip");
      const len = clip?.type === "clip" ? clipLen.get(clip.step_id) : undefined;
      if (sc.section === "demo" && len) sc.duration_s = Math.round(Math.max(sc.duration_s, Math.min(12, len)) * 10) / 10;
    }
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
    // The ffmpeg editor needs a screen recording; footage and repo videos only render with Remotion.
    if (!rec.videoPath) throw e;
    log(`Remotion render failed (${(e as Error).message.split("\n")[0].slice(0, 160)}); using the fallback editor`);
    contract = await legacyAssemble(input, flow, rec, outDir, log, tts);
  }
  const recorded = mode === "live" || mode === "sandbox-run";
  if (recorded && rec.stepsOk < flow.steps.length) {
    const failed = rec.timings.filter((x) => !x.ok).map((x) => `${x.step_id}: ${x.error ?? "failed"}`);
    contract.notes = [contract.notes, `failed steps: ${failed.join("; ")}`].filter(Boolean).join("; ");
    if (contract.status === "ok") contract.status = "partial";
  }
  if (polishNote) {
    contract.notes = [contract.notes, polishNote].filter(Boolean).join("; ");
    if (contract.status === "ok") contract.status = "partial";
  }
  const demoScenes = videoPlan.scenes.filter((sc) => sc.section === "demo").length;
  contract.steps_ok = recorded ? rec.stepsOk : demoScenes;
  contract.steps_total = recorded ? flow.steps.length : demoScenes;
  contract.demo_mode = mode;
  // Big intermediates aren't needed once demo.mp4 exists: revisions re-record and only reuse flow.json,
  // and the data volume is small, so keep just the files the team downloads.
  if (existsSync(path.join(outDir, "demo.mp4")) && process.env.KEEP_INTERMEDIATES !== "1")
    for (const f of ["recording.mp4", "clips", "shots", "audio", "repo"]) await fs.rm(path.join(outDir, f), { recursive: true, force: true });

  const files = OUTPUT_FILES.filter((f) => existsSync(path.join(outDir, f)));
  return { contract, flow, videoPlan, sessionId: plan.sessionId, hrSessionId: plan.hrSessionId, planSource: plan.source, files, demoMode: mode, notice: ctx.notice };
}

/**
 * Removes what we can't show truthfully: clips for steps that didn't record, scenes left empty,
 * statistics without a verified source (verifyResearch must run first), and problem-scene sentences
 * stating numbers no kept stat backs. Returns log lines for what was dropped.
 */
export function sanitizePlan(plan: VideoPlan, clipIds: Set<string>, outDir: string): string[] {
  const notes: string[] = [];
  const sourceOk = (id: string) => plan.sources.some((s) => s.id === id && (s.kind === "team-provided" || s.verified));
  for (const sc of plan.scenes) {
    const before = sc.elements.length;
    sc.elements = sc.elements.filter((el) => {
      if (el.type === "clip" && !clipIds.has(el.step_id) && !existsSync(path.join(outDir, "shots", `${el.step_id}.png`))) return false;
      if (el.type === "image" && !/^(shots|repo)\/[A-Za-z0-9_.-]+$/.test(el.src)) return false;
      if (el.type === "image" && !existsSync(path.join(outDir, el.src))) return false;
      if (el.type === "code" && !el.lines?.length) return false;
      if (el.type === "stat" && !sourceOk(el.source_id)) {
        notes.push(`Dropped stat "${el.value}${el.unit ?? ""} ${el.label}" in ${sc.id}: no verified source`);
        return false;
      }
      return true;
    });
    if (before && !sc.elements.length && sc.section === "demo") notes.push(`Dropped demo scene ${sc.id}: its step didn't record`);
  }
  const keptValues = plan.scenes.flatMap((sc) => sc.elements.flatMap((el) => (el.type === "stat" ? [el.value] : [])));
  notes.push(...scrubUnbackedNumbers(plan, keptValues));
  plan.scenes = plan.scenes.filter((sc) => {
    if (sc.section === "demo") return sc.elements.length > 0;
    // Outline sections with nothing true left in them are omitted, never padded.
    if (["evidence", "built", "next", "ask"].includes(sc.section) && !sc.elements.length && !sc.narration.trim()) return false;
    if (sc.section === "problem" && !sc.elements.length && !sc.narration.trim()) {
      notes.push(`Dropped scene ${sc.id}: nothing verifiable left in it`);
      return false;
    }
    return true;
  });
  plan.sources = plan.sources.filter((s) => s.kind === "team-provided" || s.verified);
  return notes;
}

/** Fallback when Remotion fails: the original ffmpeg editor, narrated per demo step. */
async function legacyAssemble(input: JobInput, flow: Flow, rec: RecordResult, outDir: string, log: (m: string) => void, tts = ttsConfigFromEnv()): Promise<Contract> {
  const dir = path.join(outDir, ".fallback");
  await fs.mkdir(path.join(dir, "shots"), { recursive: true });
  await fs.copyFile(path.join(outDir, "recording.mp4"), path.join(dir, "recording.mp4"));
  await fs.copyFile(path.join(outDir, "timings.json"), path.join(dir, "timings.json"));
  for (const f of await fs.readdir(path.join(outDir, "shots"))) await fs.copyFile(path.join(outDir, "shots", f), path.join(dir, "shots", f));
  const okIds = new Set(rec.timings.filter((t) => t.ok).map((t) => t.step_id));
  const script = { segments: flow.steps.filter((s) => okIds.has(s.id)).map((s) => ({ step_id: s.id, text: s.say })) };
  await fs.writeFile(path.join(dir, "script.json"), JSON.stringify(script));
  await voiceScript(script, dir, tts, { log });
  const contract = await assembleVideo({ outDir: dir, title: input.projectName, url: input.liveUrl, mode: rec.stepsOk >= 3 ? "recording" : "slideshow", log });
  for (const f of ["demo.mp4", "captions.srt", "thumb.jpg"]) await fs.rename(path.join(dir, f), path.join(outDir, f)).catch(() => {});
  await fs.rm(dir, { recursive: true, force: true });
  return contract;
}

/**
 * C19: runs the agent's research_queries on Brave, collects sentences with numbers from the top pages,
 * and asks the agent (same session) to pick at most 2. Returns the updated plan, or null if skipped.
 * verifyResearch still re-checks every number on its page afterwards.
 */
async function researchProblemStats(
  planner: Planner,
  plan: Extract<PlannerEvent, { type: "plan" }>,
  input: JobInput,
  log: (m: string) => void,
): Promise<{ videoPlan: VideoPlan; sessionId?: string } | null> {
  const key = process.env.BRAVE_API_KEY;
  const queries = plan.researchQueries ?? [];
  if (!key || !queries.length || !plan.sessionId || !planner.research || !plan.videoPlan) return null;
  if (!plan.videoPlan.scenes.some((sc) => sc.section === "problem")) return null;
  log(`Research: searching for "${queries.join('", "')}"`);
  const candidates = await findCandidates(queries, { search: braveSearch(key), log });
  log(`Research: ${candidates.length} candidate statistics from ${new Set(candidates.map((c) => c.url)).size} pages`);
  if (!candidates.length) return null;
  let updated: Extract<PlannerEvent, { type: "plan" }> | undefined;
  for await (const ev of planner.research({ sessionId: plan.sessionId, prompt: researchPrompt(candidates), user: input.user })) {
    if (ev.type === "log") log(ev.message);
    else updated = ev;
  }
  return updated?.videoPlan ? { videoPlan: updated.videoPlan, sessionId: updated.sessionId } : null;
}

/** Narration + a short beat; demo scenes at least 2.6s (cursor move + click), the end card 2.5s. */
/** Length target and close-ups are the team's call, so they override whatever the agent planned. */
export function applyTeamChoices(
  plan: VideoPlan,
  input: Pick<JobInput, "lengthS" | "closeups">,
  log?: (m: string) => void,
  server?: { demoMode?: DemoMode; disclaimer?: string },
) {
  if (input.lengthS) plan.target_s = input.lengthS;
  if (server?.demoMode) plan.demo_mode = server.demoMode;
  if (server?.disclaimer) plan.disclaimer = server.disclaimer;
  if (!input.closeups) return;
  let n = 0;
  for (const sc of plan.scenes)
    for (const el of sc.elements) {
      const clip = el.type === "device_frame" ? el.child : el;
      if (clip.type === "clip" && clip.zoom !== "inspect") {
        clip.zoom = "inspect";
        n++;
      }
    }
  if (n && log) log(`Close-ups on: ${n} demo step${n === 1 ? "" : "s"} will magnify the panel they touch`);
}

export function fitSceneDuration(sc: { section: string; narration: string; duration_s: number }, voice?: number): number {
  if (sc.section === "end") return 2.5;
  if (!voice || !sc.narration.trim()) return Math.min(sc.duration_s, sc.section === "demo" ? 3 : 4);
  const tail = sc.section === "demo" ? 0.45 : 0.7;
  const fit = NARRATION_LEAD_S + voice + tail;
  return Math.round(Math.max(fit, sc.section === "demo" ? 2.6 : 3) * 10) / 10;
}

/**
 * Sensitive-topic validator: rejects plans that claim to treat, diagnose, cure or replace a professional,
 * or promise outcomes without a cited source. The agent gets one rewrite (words only); anything still
 * breaking the rules is removed.
 */
async function enforceSensitive(
  videoPlan: VideoPlan,
  topic: Topic,
  planner: Planner,
  plan: Extract<PlannerEvent, { type: "plan" }>,
  input: JobInput,
  log: (m: string) => void,
) {
  let violations = checkSensitive(videoPlan, topic);
  if (!violations.length) return log(`Sensitive-topic check (${topic}): passed`);
  log(`Sensitive-topic check (${topic}): ${violations.length} line${violations.length === 1 ? "" : "s"} to fix`);
  if (planner.research && plan.sessionId && plan.source === "harness") {
    try {
      let fixed: Extract<PlannerEvent, { type: "plan" }> | undefined;
      for await (const ev of planner.research({ sessionId: plan.sessionId, prompt: sensitivePrompt(violations, topic), user: input.user })) {
        if (ev.type === "log") log(ev.message);
        else fixed = ev;
      }
      if (fixed?.videoPlan) {
        const merged = mergeJudgeRewrite(videoPlan, fixed.videoPlan);
        if (checkSensitive(merged, topic).length < violations.length) {
          videoPlan.scenes = merged.scenes;
          violations = checkSensitive(videoPlan, topic);
        }
      }
    } catch (e) {
      log(`Sensitive-topic rewrite skipped: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  const removed = scrubSensitive(videoPlan, topic);
  log(removed ? `Removed ${removed} line${removed === 1 ? "" : "s"} that still broke the ${topic} rules` : `Sensitive-topic check (${topic}): passed after the rewrite`);
}
