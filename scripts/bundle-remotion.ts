/**
 * Pre-bundles the Remotion project at image build time (Dockerfile), so jobs don't spend minutes
 * (and most of a small container's memory) running the bundler. render_video uses it via REMOTION_BUNDLE.
 * Usage: tsx scripts/bundle-remotion.ts <out_dir>
 */
import path from "node:path";
import { bundle } from "@remotion/bundler";

const outDir = path.resolve(process.argv[2] || "remotion-bundle");
bundle({ entryPoint: path.resolve("remotion/index.ts"), outDir }).then(
  (serveUrl) => console.log("Remotion bundle:", serveUrl),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
