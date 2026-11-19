/**
 * Dev check for the "inspect" close-up: renders frames of each demo step with zoom forced to inspect.
 *   npx tsx scripts/inspect-stills.ts <job_version_dir> <out_dir>
 */
import fs from "node:fs";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { VideoPlanSchema } from "../harness/schemas/video_plan";
import { getBundle, mediaFor, serveDir } from "../harness/scripts/render_video";
import { applyTeamChoices } from "../src/lib/pipeline";
import { framesFor } from "../remotion/types";

async function main() {
  const dir = path.resolve(process.argv[2] ?? "");
  const out = path.resolve(process.argv[3] ?? "inspect-stills");
  fs.mkdirSync(out, { recursive: true });
  const plan = VideoPlanSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "video_plan.json"), "utf8")));
  applyTeamChoices(plan, { closeups: true });
  const server = await serveDir(dir);
  try {
    const serveUrl = await getBundle();
    const media = await mediaFor(dir, server.base);
    const inputProps = { plan, media, hideCaptions: true };
    const composition = await selectComposition({ serveUrl, id: "PitchVideo", inputProps });
    let start = 0;
    for (const sc of plan.scenes) {
      const len = framesFor(sc.duration_s, plan.fps);
      if (sc.section === "demo")
        for (const t of [0.4, 1.4, 3]) {
          const output = path.join(out, `${sc.id}-${t}s.jpg`);
          await renderStill({ composition, serveUrl, inputProps, frame: start + Math.min(len - 1, Math.round(t * plan.fps)), output, imageFormat: "jpeg", jpegQuality: 80 });
          console.log(output);
        }
      start += len;
    }
  } finally {
    await server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
