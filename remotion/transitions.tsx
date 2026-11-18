/**
 * Scene transitions. All CSS (no WebGL), so they render the same on a headless server as on a laptop.
 * Plan ids: fade | slide | wipe | zoom | whip | push | iris | flip. Unknown ids get a section-aware pick.
 */
import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { iris } from "@remotion/transitions/iris";
import { flip } from "@remotion/transitions/flip";
import type { Section } from "../harness/schemas/video_plan";

type AnyPresentation = TransitionPresentation<Record<string, unknown>>;
type P = TransitionPresentationComponentProps<Record<string, unknown>>;

const ease = Easing.bezier(0.65, 0, 0.35, 1);

/** Zoom-through: the outgoing scene pushes towards the camera and blurs out; the next settles in. */
function ZoomThrough({ children, presentationDirection, presentationProgress }: P) {
  const p = ease(presentationProgress);
  const exiting = presentationDirection === "exiting";
  const scale = exiting ? interpolate(p, [0, 1], [1, 1.35]) : interpolate(p, [0, 1], [0.86, 1]);
  const opacity = exiting ? interpolate(p, [0, 0.7], [1, 0], { extrapolateRight: "clamp" }) : interpolate(p, [0.2, 1], [0, 1], { extrapolateLeft: "clamp" });
  const blur = exiting ? 14 * p : 10 * (1 - p);
  return <AbsoluteFill style={{ transform: `scale(${scale})`, opacity, filter: blur > 0.2 ? `blur(${blur}px)` : undefined }}>{children}</AbsoluteFill>;
}

/** Whip pan: a fast horizontal move with motion blur, like a camera snapping to the next shot. */
function Whip({ children, presentationDirection, presentationProgress }: P) {
  const p = Easing.inOut(Easing.cubic)(presentationProgress);
  const exiting = presentationDirection === "exiting";
  const x = exiting ? interpolate(p, [0, 1], [0, -100]) : interpolate(p, [0, 1], [100, 0]);
  const blur = Math.sin(Math.PI * presentationProgress) * 18;
  return <AbsoluteFill style={{ transform: `translateX(${x}%)`, filter: blur > 0.3 ? `blur(${blur}px)` : undefined }}>{children}</AbsoluteFill>;
}

/** Push: the next scene rises over the current one, which recedes and dims. */
function Push({ children, presentationDirection, presentationProgress }: P) {
  const p = ease(presentationProgress);
  if (presentationDirection === "exiting")
    return <AbsoluteFill style={{ transform: `scale(${interpolate(p, [0, 1], [1, 0.92])})`, opacity: interpolate(p, [0, 1], [1, 0.25]) }}>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill style={{ transform: `translateY(${interpolate(p, [0, 1], [100, 0])}%)`, boxShadow: "0 -30px 80px rgba(0,0,0,0.45)" }}>
      {children}
    </AbsoluteFill>
  );
}

const custom = (component: React.FC<P>): AnyPresentation => ({ component, props: {} }) as AnyPresentation;
const cast = (p: unknown) => p as AnyPresentation;

export const TRANSITION_IDS = ["fade", "slide", "wipe", "zoom", "whip", "push", "iris", "flip"] as const;

export function presentationFor(id: string, size: { width: number; height: number }): AnyPresentation {
  switch (id) {
    case "slide":
      return cast(slide({ direction: "from-right" }));
    case "wipe":
      return cast(wipe({ direction: "from-left" }));
    case "zoom":
      return custom(ZoomThrough);
    case "whip":
      return custom(Whip);
    case "push":
      return custom(Push);
    case "iris":
      return cast(iris({ width: size.width, height: size.height }));
    case "flip":
      return cast(flip({ direction: "from-right" }));
    default:
      return cast(fade());
  }
}

/**
 * Section boundaries mark the story beats: zoom into the solution, push into the demo, iris to the
 * end card, unless the agent named one of the newer transitions. Inside a section the agent's choice
 * stands, except that a plain fade between demo steps becomes slide/whip so the demo keeps moving.
 */
const BEAT = ["zoom", "whip", "push", "iris", "flip"];
export function chooseTransition(requested: string | undefined, from: Section, to: Section, index: number): string {
  const known = !!requested && (TRANSITION_IDS as readonly string[]).includes(requested);
  if (from !== to) {
    if (known && BEAT.includes(requested!)) return requested!;
    if (to === "solution") return "zoom";
    if (to === "demo") return "push";
    if (to === "end") return "iris";
    return known ? requested! : "wipe";
  }
  if (to === "demo" && (!known || requested === "fade")) return index % 2 ? "whip" : "slide";
  return known ? requested! : "fade";
}
