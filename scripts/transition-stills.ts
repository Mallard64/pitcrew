/**
 * Dev check: renders one frame from the middle of every scene transition in a plan.
 *   npx tsx scripts/transition-stills.ts <job_version_dir> <out_dir> [kit]
 */
import fs from "node:fs";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { VideoPlanSchema } from "../harness/schemas/video_plan";
import { getBundle, mediaFor, serveDir } from "../harness/scripts/render_video";
import { framesFor, transitionFrames } from "../remotion/types";
import { chooseTransition } from "../remotion/transitions";
async function main() {
  const dir = path.resolve(process.argv[2]);
  const out = process.argv[3];
  const plan = VideoPlanSchema.parse(
    JSON.parse(fs.readFileSync(path.join(dir, "video_plan.json"), "utf8")),
  );
  if (process.argv[4]) plan.style_kit = process.argv[4];
  const server = await serveDir(dir);
  const serveUrl = await getBundle();
  const inputProps = { plan, media: await mediaFor(dir, server.base) };
  const composition = await selectComposition({ serveUrl, id: "PitchVideo", inputProps });
  let t = 0;
  for (let i = 0; i < plan.scenes.length - 1; i++) {
    t += framesFor(plan.scenes[i].duration_s, plan.fps);
    const id = chooseTransition(
      plan.scenes[i + 1].transition_in,
      plan.scenes[i].section,
      plan.scenes[i + 1].section,
      i,
    );
    const frame = t + Math.round(transitionFrames(plan.fps) * 0.45);
    await renderStill({
      composition,
      serveUrl,
      inputProps,
      frame,
      output: `${out}/t${i}-${id}.jpg`,
      imageFormat: "jpeg",
      scale: 0.5,
    });
    console.log(i, plan.scenes[i + 1].transition_in, "->", id, frame);
  }
  await server.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
