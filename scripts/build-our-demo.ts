/**
 * Builds Pit Crew's own submission video from real screen recordings of the live site, using Pit Crew's
 * own engine: a standard video plan (Blueprint look, diagram element), ElevenLabs voice, Remotion render.
 *   npx tsx --env-file=.env scripts/build-our-demo.ts
 * Inputs:  launch/footage/run/{site.mp4,events.json}, launch/footage/{omnistem,devpad,wumpus}/{site.mp4,events.json}
 * Output:  launch/build/ (plan, audio, clips), launch/our-demo.mp4, launch/our-demo.srt, launch/our-demo-script.md
 */
import fs from "node:fs";
import path from "node:path";
import { ffmpeg, probeDuration } from "../harness/scripts/ff";
import { voiceScript, ttsConfigFromEnv } from "../harness/scripts/tts";
import { renderVideo } from "../harness/scripts/render_video";
import { captionChunks, toSrt, NARRATION_LEAD_S, type Chunk } from "../harness/captions";
import { fitSceneDuration } from "../src/lib/pipeline";
import { choosePace, lengthWindow } from "../src/lib/pacing";
import { VOICES } from "../src/lib/voices";
import { VideoPlanSchema, type Scene, type VideoPlan } from "../harness/schemas/video_plan";

const SITE = "https://pitcrew-production-83e5860b.up.railway.app";
const F = path.resolve("launch/footage");
const OUT = path.resolve("launch/build");
const ev = (dir: string) =>
  JSON.parse(fs.readFileSync(path.join(F, dir, "events.json"), "utf8")) as Record<string, number>;

type Cut = { id: string; src: string; from: number; to: number };

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "clips"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
  const run = ev("run");
  const page = (dir: string): Cut => {
    const e = ev(dir);
    return {
      id: `c_${dir}`,
      src: path.join(F, dir, "site.mp4"),
      from: Math.max(0, e.page + 0.2),
      to: e.end - 0.3,
    };
  };
  const runSrc = path.join(F, "run", "site.mp4");

  // Real moments from the recordings (seconds from the start of each recording).
  const cuts: Cut[] = [
    { id: "c_form", src: runSrc, from: run.form - 0.5, to: run.submit + 2.5 },
    { id: "c_progress", src: runSrc, from: run.job_page + 1, to: run.review - 0.5 },
    { id: "c_review", src: runSrc, from: run.review + 1, to: run.approve + 2 },
    { id: "c_done", src: runSrc, from: run.done - 0.5, to: run.end - 0.3 },
    page("omnistem"),
    page("devpad"),
    page("wumpus"),
  ];

  const scenes: Scene[] = [];
  const add = (sc: Partial<Scene> & Pick<Scene, "id" | "section" | "narration" | "elements">) =>
    scenes.push({ layout: "big-statement", duration_s: 5, transition_in: "fade", ...sc } as Scene);
  add({
    id: "problem",
    section: "problem",
    narration:
      "Every team at this hackathon has to submit a demo video. Most of us are making it right now, at 3 a.m. A good one needs a script, a clean recording, editing, a voiceover and captions. That's hours you don't have.",
    elements: [
      {
        type: "kinetic_headline",
        text: "The demo video is due at 11:59 AM",
        animation: "word-by-word",
      },
      {
        type: "bullets",
        items: ["Write a script", "Record a clean demo", "Edit, voice and caption it"],
        animation: "slide-up",
      },
    ],
  });
  add({
    id: "solution",
    section: "solution",
    narration:
      "Pit Crew makes the pitch video for you. Paste your live link, or just your GitHub repo.",
    elements: [
      { type: "kinetic_headline", text: "Paste a link. Get a pitch.", animation: "word-by-word" },
      {
        type: "text",
        text: "Live link or GitHub repo → a narrated 1080p pitch video",
        role: "body",
      },
    ],
  });
  const demo: [string, string][] = [
    [
      "c_form",
      "Here's a real run. I paste Excalidraw's link, pick a narrator, and ask to review the script first.",
    ],
    [
      "c_progress",
      "An agent on HarnessRouter explores the site and plans the pitch, while our server records each step in Chromium.",
    ],
    [
      "c_review",
      "Before anything is voiced, I get the outline and a pitch check, and I can change any line.",
    ],
    [
      "c_done",
      "Then it's voiced and rendered into a finished 1080p pitch video, ready to download.",
    ],
    [
      "c_omnistem",
      "No live link? OmniSTEM is just a GitHub repo. Pit Crew ran it inside a HarnessRouter sandbox and recorded it there.",
    ],
    [
      "c_devpad",
      "DevPad's API ran the same way, and its video shows the real responses, sign-in errors included.",
    ],
    [
      "c_wumpus",
      "And Hunt the Wumpus, a Unity game, got its video from the team's own gameplay clip, narrated from frames the agent actually looked at.",
    ],
  ];
  for (const [id, narration] of demo)
    add({
      id: `demo_${id}`,
      section: "demo",
      layout: "full-frame",
      narration,
      elements: [{ type: "clip", step_id: id, zoom: "none" }],
    });
  add({
    id: "built",
    section: "built",
    layout: "diagram",
    narration:
      "Here's how it works. Our server hands the project to an agent on HarnessRouter, which explores the site or runs the repo in its sandbox, and writes the plan as JSON. Our server checks every statistic against its source page, records the demo, waits for your review, then ElevenLabs voices it and Remotion renders it.",
    elements: [
      {
        type: "diagram",
        kind: "layered",
        nodes: [
          { id: "team", label: "Your link or repo" },
          { id: "server", label: "Pit Crew server" },
          { id: "agent", label: "HarnessRouter agent" },
          { id: "stats", label: "Stat checker" },
          { id: "rec", label: "Chromium recorder" },
          { id: "review", label: "Your review" },
          { id: "voice", label: "ElevenLabs voice" },
          { id: "render", label: "Remotion render" },
        ],
        edges: [
          { from: "team", to: "server" },
          { from: "server", to: "agent", label: "task" },
          { from: "agent", to: "stats", label: "plan" },
          { from: "stats", to: "rec" },
          { from: "rec", to: "review" },
          { from: "review", to: "voice" },
          { from: "voice", to: "render" },
        ],
      },
    ],
  });
  add({
    id: "evidence",
    section: "evidence",
    layout: "bullet-reveal",
    narration:
      "Tonight we tested it on Excalidraw, Hoppscotch, Carbon, Mermaid and Squoosh, plus three student projects straight from GitHub.",
    elements: [
      {
        type: "bullets",
        items: [
          "Live sites: Excalidraw, Hoppscotch, Carbon, Mermaid, Squoosh",
          "GitHub only: OmniSTEM, DevPad, Hunt the Wumpus",
        ],
        animation: "slide-up",
      },
      { type: "text", text: "Our own test runs, Nov 18", role: "label" },
    ],
  });
  add({
    id: "next",
    section: "next",
    layout: "bullet-reveal",
    narration: "Next: a pitch video for every launch. Product Hunt, demo days, investor updates.",
    elements: [
      {
        type: "bullets",
        items: ["Product Hunt launches", "Demo days", "Investor updates"],
        animation: "slide-up",
      },
    ],
  });
  add({
    id: "ask",
    section: "ask",
    narration: "Paste your link, and Pit Crew makes the pitch.",
    elements: [
      {
        type: "kinetic_headline",
        text: "Paste your link. Pit Crew makes the pitch.",
        animation: "word-by-word",
      },
      {
        type: "text",
        text: "#bighackgame · Rendered with Pit Crew's own video engine",
        role: "label",
      },
    ],
  });
  add({
    id: "end",
    section: "end",
    layout: "end-card",
    narration: "",
    duration_s: 3,
    elements: [],
  });

  // 1. Voice (Sarah), paced for a ~115 s video.
  const pace = choosePace(scenes, lengthWindow(150));
  const script = {
    segments: scenes
      .filter((s) => s.narration)
      .map((s) => ({ step_id: s.id, text: s.narration, pace: pace.perScene.get(s.id) })),
  };
  const tts = ttsConfigFromEnv();
  if (tts.provider === "elevenlabs") tts.voice = VOICES.sarah.elevenlabs;
  else if (tts.provider === "openai") tts.voice = VOICES.sarah.openai;
  const audio = await voiceScript(script, OUT, tts, { log: console.log });
  const len = new Map(audio.map((a) => [a.step_id, a.duration_s]));
  for (const sc of scenes) sc.duration_s = fitSceneDuration(sc, len.get(sc.id));
  // The finished videos get time to play; the others follow the narration.
  const extra: Record<string, number> = {
    demo_c_done: 10,
    demo_c_omnistem: 4,
    demo_c_devpad: 4,
    demo_c_wumpus: 4,
  };
  for (const sc of scenes)
    if (extra[sc.id]) sc.duration_s = Math.round((sc.duration_s + extra[sc.id]) * 10) / 10;

  // 2. Cut each recorded moment to its scene length. Waiting is sped up (and labeled); playing videos stay real-time.
  const manifest = [];
  for (const c of cuts) {
    const sc = scenes.find((s) => s.id === `demo_${c.id}`)!;
    const speedable = c.id === "c_progress" || c.id === "c_form" || c.id === "c_review";
    const raw = speedable
      ? Math.max(1, c.to - c.from)
      : Math.min(Math.max(1, c.to - c.from), sc.duration_s);
    const factor = Math.max(1, raw / sc.duration_s);
    const file = path.join(OUT, "clips", `${c.id}.mp4`);
    await ffmpeg([
      "-ss",
      c.from.toFixed(2),
      "-t",
      raw.toFixed(2),
      "-i",
      c.src,
      "-vf",
      `setpts=PTS/${factor.toFixed(4)},fps=30,format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-an",
      file,
    ]);
    await ffmpeg([
      "-sseof",
      "-0.2",
      "-i",
      file,
      "-frames:v",
      "1",
      path.join(OUT, "shots", `${c.id}.png`),
    ]);
    if (factor >= 2)
      sc.elements.push({ type: "text", text: `▶▶ ×${Math.round(factor)} sped up`, role: "label" });
    manifest.push({
      step_id: c.id,
      file: `clips/${c.id}.mp4`,
      duration_s: await probeDuration(file),
      raw_duration_s: raw,
      speedups: [],
    });
    console.log(`${c.id}: ${raw.toFixed(1)} s → ${sc.duration_s} s (×${factor.toFixed(1)})`);
  }
  fs.writeFileSync(path.join(OUT, "clips", "manifest.json"), JSON.stringify(manifest, null, 2));

  // 3. Plan, captions, render.
  const plan: VideoPlan = VideoPlanSchema.parse({
    version: 1,
    seed: 2026,
    style_kit: "blueprint",
    brand: { primary: "#6366f1" },
    // Plans are authored at 1280x720; the renderer scales the output to 1080p.
    size: { width: 1280, height: 720 },
    fps: 30,
    credit: false,
    demo_mode: "live",
    scenes,
    sources: [],
    flow: {
      project_name: "Pit Crew",
      url: SITE,
      viewport: { width: 1280, height: 720 },
      steps: cuts.map((c) => ({ id: c.id, action: "goto", url: SITE, hold_ms: 3000, say: "" })),
    },
  });
  fs.writeFileSync(path.join(OUT, "video_plan.json"), JSON.stringify(plan, null, 2));
  const srt: Chunk[] = [];
  let t = 0;
  for (const sc of plan.scenes) {
    const l = len.get(sc.id);
    if (l) srt.push(...captionChunks(sc.narration, t + NARRATION_LEAD_S, l));
    t += sc.duration_s;
  }
  fs.writeFileSync(path.join(OUT, "captions.srt"), toSrt(srt));
  const contract = await renderVideo(OUT, console.log);
  fs.copyFileSync(path.join(OUT, "demo.mp4"), path.resolve("launch/our-demo.mp4"));
  fs.copyFileSync(path.join(OUT, "captions.srt"), path.resolve("launch/our-demo.srt"));
  fs.writeFileSync(
    path.resolve("launch/our-demo-script.md"),
    `# Pit Crew: our demo video, final narration\n\nRendered with Pit Crew's own engine (Blueprint look, Sarah voice). Every demo shot is a real screen recording of ${SITE}, cut and sped up where labeled.\n\n` +
      plan.scenes
        .map((s) => `**${s.section}** (${s.duration_s} s): ${s.narration || "_(end card)_"}`)
        .join("\n\n") +
      `\n\nTotal: ${contract.duration_s} s.\n`,
  );
  console.log(JSON.stringify({ duration_s: contract.duration_s, notes: contract.notes }));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
