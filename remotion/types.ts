import { useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoPlan } from "../harness/schemas/video_plan";

export type ClipMedia = { url: string; duration_s: number; box?: { x: number; y: number; w: number; h: number } };

export type PitchVideoProps = {
  plan: VideoPlan;
  /** Media served over http during the render (clips by step id, images by name). */
  media: { clips: Record<string, ClipMedia>; images: Record<string, string>; audio: Record<string, { url: string; duration_s: number }> };
  /** Poster frames only: draw the scene without burned-in captions. */
  hideCaptions?: boolean;
};

/** Animations are authored in 30fps "design frames" and play at the same speed at any output fps. */
export const DESIGN_FPS = 30;
export function useDesignFrame() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (frame * DESIGN_FPS) / fps;
}

/** Half a second at the output frame rate. */
export const transitionFrames = (fps: number) => Math.round(fps / 2);
export const framesFor = (seconds: number, fps: number) => Math.max(1, Math.round(seconds * fps));
