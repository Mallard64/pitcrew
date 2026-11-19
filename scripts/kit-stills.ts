/**
 * Renders the landing-page gallery: public/kits/<kit>.jpg (problem scene) and <kit>-demo.jpg (third demo
 * step) for every style kit, all from one recorded plan so only the look differs.
 *   npx tsx scripts/kit-stills.ts <job_version_dir>     e.g. data/jobs/<id>/v1
 *   (needs clips/ and shots/: run the job with KEEP_INTERMEDIATES=1, they are deleted after render otherwise)
 */
import fs from "node:fs";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { VideoPlanSchema } from "../harness/schemas/video_plan";
import { getBundle, mediaFor, serveDir } from "../harness/scripts/render_video";
import { KIT_IDS } from "../remotion/kits/default";
import { framesFor } from "../remotion/types";

async function main() {
  const dir = path.resolve(process.argv[2] ?? "");
  const plan = VideoPlanSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "video_plan.json"), "utf8")));
  const server = await serveDir(dir);
  try {
    const serveUrl = await getBundle();
    const media = await mediaFor(dir, server.base);
    // The third demo step (or the last one): early steps are often an empty page.
    const demoIdx = plan.scenes.map((s, i) => (s.section === "demo" ? i : -1)).filter((i) => i >= 0);
    const pick = demoIdx[Math.min(2, demoIdx.length - 1)];
    const demoStart = plan.scenes.slice(0, pick).reduce((n, s) => n + framesFor(s.duration_s, plan.fps), 0);
    const frames = { "": Math.round(3 * plan.fps), "-demo": demoStart + Math.round(3.5 * plan.fps) };
    for (const kit of KIT_IDS) {
      const inputProps = { plan: { ...plan, style_kit: kit }, media };
      const composition = await selectComposition({ serveUrl, id: "PitchVideo", inputProps });
      for (const [suffix, frame] of Object.entries(frames)) {
        const output = path.resolve("public/kits", `${kit}${suffix}.jpg`);
        await renderStill({ composition, serveUrl, inputProps, frame, output, imageFormat: "jpeg", jpegQuality: 85 });
        console.log(output);
      }
    }
  } finally {
    await server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
