import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { Scene } from "./Scene";
import { accentOn, resolveKit, type Kit } from "./kits/default";
import { chooseTransition, presentationFor } from "./transitions";
import { transitionFrames, framesFor, type PitchVideoProps } from "./types";

export function PitchVideo({ plan, media, hideCaptions }: PitchVideoProps) {
  const kit = resolveKit(plan.style_kit, plan.seed, plan.brand.primary);
  const ctx = { kit, sources: plan.sources, media, url: plan.flow.url, credit: plan.credit, hideCaptions, demoMode: plan.demo_mode ?? "live" };
  const children: React.ReactNode[] = [];
  plan.scenes.forEach((scene, i) => {
    const hasNext = i < plan.scenes.length - 1;
    // Each transition overlaps two scenes; extend the outgoing scene so the total stays = sum of durations.
    const frames = framesFor(scene.duration_s, plan.fps) + (hasNext ? transitionFrames(plan.fps) : 0);
    children.push(
      <TransitionSeries.Sequence key={scene.id} durationInFrames={frames}>
        <Scene scene={scene} ctx={ctx} index={i} />
      </TransitionSeries.Sequence>,
    );
    if (hasNext) {
      children.push(
        <TransitionSeries.Transition
          key={`${scene.id}-t`}
          presentation={presentationFor(chooseTransition(plan.scenes[i + 1].transition_in, scene.section, plan.scenes[i + 1].section, i), plan.size)}
          // Eased (critically damped spring), fixed length so scene timing stays exact.
          timing={springTiming({ config: { damping: 200 }, durationInFrames: transitionFrames(plan.fps), durationRestThreshold: 0.001 })}
        />,
      );
    }
  });
  return (
    <AbsoluteFill style={{ background: kit.bg }}>
      <TransitionSeries>{children}</TransitionSeries>
      <Progress kit={kit} />
      {plan.disclaimer && <Disclaimer text={plan.disclaimer} kit={kit} width={plan.size.width} />}
    </AbsoluteFill>
  );
}

/** Thin brand-coloured progress line along the top edge. */
function Progress({ kit }: { kit: Kit }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        height: kit.window === "brutal" ? 6 : 3,
        width: `${(100 * frame) / Math.max(1, durationInFrames - 1)}%`,
        background: kit.window === "brutal" ? "#000" : accentOn(kit),
      }}
    />
  );
}

/** Sensitive topics: a small, always-visible line (e.g. "Not a substitute for professional care"). */
function Disclaimer({ text, kit, width }: { text: string; kit: Kit; width: number }) {
  const u = width / 1280;
  return (
    <div
      style={{
        position: "absolute",
        top: 14 * u,
        right: 18 * u,
        padding: `${5 * u}px ${12 * u}px`,
        borderRadius: 999,
        fontFamily: kit.font,
        fontSize: 15 * u,
        fontWeight: 600,
        color: kit.mode === "light" ? "#1f2937" : "#f8fafc",
        background: kit.mode === "light" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)",
        border: `1px solid ${accentOn(kit, 0.5)}`,
      }}
    >
      {text}
    </div>
  );
}
