/**
 * Renders one scene. A deliberately small first version (C3): stacked elements on the kit
 * background. The primitives library (C11) and layouts (C12) replace the element renderers here.
 */
import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { captionChunks, NARRATION_LEAD_S } from "../harness/captions";
import type { Element, Scene as SceneT, Source } from "../harness/schemas/video_plan";
import type { Kit } from "./kits/default";
import type { PitchVideoProps } from "./types";

type Ctx = { kit: Kit; sources: Source[]; media: PitchVideoProps["media"]; url: string; credit: boolean; audioDuration?: number };

const fadeUp = (frame: number, delay: number) => ({
  opacity: interpolate(frame - delay, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  transform: `translateY(${interpolate(frame - delay, [0, 12], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
});

function Stat({ el, ctx, delay }: { el: Extract<Element, { type: "stat" }>; ctx: Ctx; delay: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = ctx.sources.find((s) => s.id === el.source_id);
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 40 });
  const decimals = (String(el.value).split(".")[1] ?? "").length;
  const shown = (el.value * p).toFixed(decimals);
  const citation = !src ? "" : src.kind === "team-provided" ? "Source: the team" : `Source: ${src.source_name}, ${src.year}`;
  return (
    <div style={{ textAlign: "center", ...fadeUp(frame, delay) }}>
      <div style={{ fontSize: ctx.kit.titleSize * 1.6, fontWeight: 800, color: ctx.kit.accent, lineHeight: 1 }}>
        {shown}
        {el.unit ? <span style={{ fontSize: ctx.kit.titleSize * 0.7 }}>{el.unit === "%" ? "%" : ` ${el.unit}`}</span> : null}
      </div>
      <div style={{ fontSize: ctx.kit.bodySize, marginTop: 16 }}>{el.label}</div>
      {citation && <div style={{ fontSize: ctx.kit.citationSize, color: ctx.kit.muted, marginTop: 14 }}>{citation}</div>}
    </div>
  );
}

function Clip({ el, ctx }: { el: Extract<Element, { type: "clip" }>; ctx: Ctx }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const m = ctx.media.clips[el.step_id];
  if (!m) return null;
  const clipFrames = Math.max(1, Math.floor(m.duration_s * fps) - 1);
  const still = ctx.media.images[`shots/${el.step_id}.png`];
  let style: React.CSSProperties = {};
  if (el.zoom === "target" && m.box) {
    // Spring zoom that also pans the target toward the centre; clamped so no edge of the video shows.
    const scale = Math.min(1.8, Math.max(1, Math.min(width / (m.box.w * 2.2), height / (m.box.h * 3))));
    const k = spring({ frame: frame - 8, fps, config: { damping: 200 }, durationInFrames: 30 });
    const sc = 1 + (scale - 1) * k;
    const cx = m.box.x + m.box.w / 2;
    const cy = m.box.y + m.box.h / 2;
    const tx = Math.min(0, Math.max(width - width * sc, width / 2 - cx * sc));
    const ty = Math.min(0, Math.max(height - height * sc, height / 2 - cy * sc));
    style = { transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${sc})` };
  }
  return (
    <AbsoluteFill style={style}>
      <Sequence durationInFrames={clipFrames} layout="none">
        <OffthreadVideo src={m.url} muted playbackRate={el.speed ?? 1} />
      </Sequence>
      {/* Narration can outlast the clip: hold the step's final screenshot instead of going blank. */}
      {still && (
        <Sequence from={clipFrames} layout="none">
          <Img src={still} style={{ width: "100%", height: "100%" }} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}

function Captions({ text, ctx, top }: { text: string; ctx: Ctx; top?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audio = ctx.audioDuration;
  if (!text.trim() || !audio) return null;
  const t = frame / fps;
  const chunk = captionChunks(text, NARRATION_LEAD_S, audio).find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  return (
    <AbsoluteFill style={{ justifyContent: top ? "flex-start" : "flex-end", alignItems: "center", paddingBottom: 40, paddingTop: 40 }}>
      <div style={{ maxWidth: 1040, padding: "10px 22px", borderRadius: 10, background: "rgba(0,0,0,.72)", color: "#fff", fontSize: 32, lineHeight: 1.3, fontWeight: 600, textAlign: "center", fontFamily: ctx.kit.font }}>
        {chunk.text}
      </div>
    </AbsoluteFill>
  );
}

function renderElement(el: Element, i: number, ctx: Ctx, frame: number): React.ReactNode {
  const delay = 6 + i * 8;
  const { kit } = ctx;
  switch (el.type) {
    case "text":
      return (
        <div key={i} style={{ fontSize: el.role === "title" ? kit.titleSize : el.role === "label" ? kit.citationSize : kit.bodySize, fontWeight: el.role === "title" ? 800 : 500, color: el.role === "label" ? kit.muted : kit.fg, maxWidth: 1050, textAlign: "center", lineHeight: 1.15, ...fadeUp(frame, delay) }}>
          {el.text}
        </div>
      );
    case "kinetic_headline": {
      const words = el.text.split(/\s+/);
      return (
        <div key={i} style={{ fontSize: kit.titleSize, fontWeight: 800, maxWidth: 1100, textAlign: "center", lineHeight: 1.1 }}>
          {words.map((w, j) => (
            <span key={j} style={{ display: "inline-block", marginRight: "0.25em", ...fadeUp(frame, delay + j * 3) }}>
              {w}
            </span>
          ))}
        </div>
      );
    }
    case "stat":
      return <Stat key={i} el={el} ctx={ctx} delay={delay} />;
    case "bullets":
      return (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 18, fontSize: kit.bodySize, maxWidth: 1000 }}>
          {el.items.map((it, j) => (
            <div key={j} style={{ display: "flex", gap: 16, alignItems: "baseline", ...fadeUp(frame, delay + j * 10) }}>
              <span style={{ color: kit.accent, fontWeight: 800 }}>→</span>
              <span>{it}</span>
            </div>
          ))}
        </div>
      );
    case "image": {
      const src = ctx.media.images[el.src];
      return src ? <Img key={i} src={src} style={{ maxWidth: "80%", maxHeight: "70%", objectFit: el.fit, borderRadius: 12, ...fadeUp(frame, delay) }} /> : null;
    }
    case "clip":
      return <Clip key={i} el={el} ctx={ctx} />;
    case "device_frame":
      return (
        <div key={i} style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.45)", width: 1000, height: 562, position: "relative", ...fadeUp(frame, delay) }}>
          {renderElement(el.child, i, ctx, frame)}
        </div>
      );
    default:
      // node / arrow / icon / shape / diagram arrive with C11 + C16.
      return null;
  }
}

export function Scene({ scene, ctx: baseCtx }: { scene: SceneT; ctx: Ctx }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audio = baseCtx.media.audio[scene.id];
  const ctx: Ctx = { ...baseCtx, audioDuration: audio?.duration_s };
  const { kit } = ctx;
  const voice = audio ? (
    <Sequence from={Math.round(NARRATION_LEAD_S * fps)} layout="none">
      <Audio src={audio.url} />
    </Sequence>
  ) : null;
  const hasClip = scene.elements.some((e) => e.type === "clip");
  // Keep captions off the thing we're pointing at: move them up when the zoom target sits low.
  const targetLow = scene.elements.some((e) => {
    if (e.type !== "clip" || e.zoom !== "target") return false;
    const b = ctx.media.clips[e.step_id]?.box;
    return !!b && b.y + b.h / 2 > 720 * 0.6;
  });
  if (scene.section === "end") {
    return (
      <AbsoluteFill style={{ background: kit.bg, color: kit.fg, fontFamily: kit.font, justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontSize: kit.titleSize, fontWeight: 800, ...fadeUp(frame, 4) }}>Try it</div>
        <div style={{ fontSize: kit.bodySize + 4, color: kit.accent, marginTop: 20, ...fadeUp(frame, 10) }}>{ctx.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
        {scene.elements.map((el, i) => renderElement(el, i + 2, ctx, frame))}
        {ctx.credit && <div style={{ position: "absolute", bottom: 36, fontSize: ctx.kit.citationSize, color: kit.muted }}>Made with Pit Crew</div>}
        {voice}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: kit.bg, color: kit.fg, fontFamily: kit.font }}>
      {hasClip && scene.elements.filter((e) => e.type === "clip").map((el, i) => renderElement(el, i, ctx, frame))}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 28, padding: 80 }}>
        {scene.elements.filter((e) => e.type !== "clip").map((el, i) => renderElement(el, i, ctx, frame))}
      </AbsoluteFill>
      <Captions text={scene.narration} ctx={ctx} top={targetLow} />
      {voice}
    </AbsoluteFill>
  );
}
