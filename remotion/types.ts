import type { VideoPlan } from "../harness/schemas/video_plan";

export type ClipMedia = { url: string; duration_s: number; box?: { x: number; y: number; w: number; h: number } };

export type PitchVideoProps = {
  plan: VideoPlan;
  /** Media served over http during the render (clips by step id, images by name). */
  media: { clips: Record<string, ClipMedia>; images: Record<string, string>; audio: Record<string, { url: string; duration_s: number }> };
};

export const TRANSITION_FRAMES = 15;
export const framesFor = (seconds: number, fps: number) => Math.max(1, Math.round(seconds * fps));
