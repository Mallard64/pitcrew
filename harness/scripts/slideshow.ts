/**
 * Fallback renderer: step screenshots with a slow zoom + narration, for when live recording is flaky.
 * CLI: tsx harness/scripts/slideshow.ts <out_dir> --title "<project_name>" --url "<url>"
 * Same outputs and contract as assemble.ts, with render_mode "slideshow".
 */
import path from "node:path";
import { assembleVideo, parseCliArgs } from "./assemble";

export const renderSlideshow = (outDir: string, title: string, url: string, log?: (m: string) => void) =>
  assembleVideo({ outDir, title, url, mode: "slideshow", log });

async function main() {
  const a = parseCliArgs(process.argv.slice(2));
  if (!a.outDir) {
    console.error('usage: tsx harness/scripts/slideshow.ts <out_dir> --title "<name>" --url "<url>"');
    process.exit(1);
  }
  console.log(JSON.stringify(await renderSlideshow(a.outDir, a.title, a.url, console.error)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
