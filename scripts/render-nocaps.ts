/** Renders launch/build again without burned-in captions: launch/build/demo-nocaps.mp4 (run after build-our-demo.ts). */
import path from "node:path";
import { renderVideo } from "../harness/scripts/render_video";
renderVideo(path.resolve("launch/build"), console.log, { hideCaptions: true, output: "demo-nocaps.mp4" })
  .then((c) => console.log(JSON.stringify({ duration_s: c.duration_s })))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
