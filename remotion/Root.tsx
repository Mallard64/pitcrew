import React from "react";
import { Composition } from "remotion";
import { PitchVideo } from "./PitchVideo";
import { framesFor, type PitchVideoProps } from "./types";

const EMPTY: PitchVideoProps = {
  plan: {
    version: 1, seed: 0, style_kit: "default", brand: { primary: "#6366f1" }, size: { width: 1280, height: 720 }, fps: 30, credit: true,
    scenes: [{ id: "e", section: "end", layout: "end-card", duration_s: 2, narration: "", elements: [], transition_in: "fade" }],
    flow: { project_name: "Demo", url: "https://example.com", viewport: { width: 1280, height: 720 }, steps: [{ id: "s1", action: "wait", hold_ms: 1000, say: "" }] },
    sources: [],
  },
  media: { clips: {}, images: {} },
};

export function Root() {
  return (
    <Composition
      id="PitchVideo"
      component={PitchVideo as unknown as React.FC<Record<string, unknown>>}
      defaultProps={EMPTY as unknown as Record<string, unknown>}
      durationInFrames={60}
      fps={30}
      width={1280}
      height={720}
      calculateMetadata={({ props }) => {
        const { plan } = props as unknown as PitchVideoProps;
        const total = plan.scenes.reduce((n, s) => n + framesFor(s.duration_s, plan.fps), 0);
        return { durationInFrames: total, fps: plan.fps, width: plan.size.width, height: plan.size.height };
      }}
    />
  );
}
