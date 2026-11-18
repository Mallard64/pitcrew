import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { Scene } from "./Scene";
import { DEFAULT_KIT, brandTint } from "./kits/default";
import { TRANSITION_FRAMES, framesFor, type PitchVideoProps } from "./types";

// Transitions not built yet (zoom-through, match-cut, whip: C13) fall back to fade.
// Presentations have different prop types; the series only needs the common shape.
function presentation(id: string): TransitionPresentation<Record<string, unknown>> {
  switch (id) {
    case "slide":
      return slide() as unknown as TransitionPresentation<Record<string, unknown>>;
    case "wipe":
      return wipe() as unknown as TransitionPresentation<Record<string, unknown>>;
    default:
      return fade() as unknown as TransitionPresentation<Record<string, unknown>>;
  }
}

export function PitchVideo({ plan, media }: PitchVideoProps) {
  const kit = { ...DEFAULT_KIT, accent: plan.brand.primary };
  const ctx = { kit, sources: plan.sources, media, url: plan.flow.url, credit: plan.credit };
  const children: React.ReactNode[] = [];
  plan.scenes.forEach((scene, i) => {
    const hasNext = i < plan.scenes.length - 1;
    // Each transition overlaps two scenes; extend the outgoing scene so the total stays = sum of durations.
    const frames = framesFor(scene.duration_s, plan.fps) + (hasNext ? TRANSITION_FRAMES : 0);
    children.push(
      <TransitionSeries.Sequence key={scene.id} durationInFrames={frames}>
        <Scene scene={scene} ctx={ctx} index={i} />
      </TransitionSeries.Sequence>,
    );
    if (hasNext) {
      children.push(
        <TransitionSeries.Transition
          key={`${scene.id}-t`}
          presentation={presentation(plan.scenes[i + 1].transition_in)}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />,
      );
    }
  });
  return (
    <AbsoluteFill style={{ background: kit.bg }}>
      <TransitionSeries>{children}</TransitionSeries>
      <Progress color={kit.accent} />
    </AbsoluteFill>
  );
}

/** Thin brand-coloured progress line along the top edge. */
function Progress({ color }: { color: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        height: 3,
        width: `${(100 * frame) / Math.max(1, durationInFrames - 1)}%`,
        background: `linear-gradient(90deg, ${brandTint(color, 55)}, ${brandTint(color, 78)})`,
        boxShadow: `0 0 10px ${brandTint(color, 60)}`,
      }}
    />
  );
}
