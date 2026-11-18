/**
 * Renders one scene on the animated brand backdrop.
 * - Demo scenes: the recording plays inside a floating browser window; zoom and the target highlight
 *   happen inside the window, and captions sit in their own band below it, so they never cover the app.
 * - Title scenes: section label, gradient kinetic headline, growing accent bar, supporting text.
 * The composition is laid out in 1280x720 units and rendered at a higher scale for crisp output.
 * The primitives library (C11) and layouts (C12) will extend the element renderers here.
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { captionChunks, NARRATION_LEAD_S } from "../harness/captions";
import type { Element, Scene as SceneT, Source } from "../harness/schemas/video_plan";
import { Backdrop } from "./Backdrop";
import { brandTint, type Kit } from "./kits/default";
import { DESIGN_FPS, useDesignFrame, type PitchVideoProps } from "./types";

type Ctx = {
  kit: Kit;
  sources: Source[];
  media: PitchVideoProps["media"];
  url: string;
  credit: boolean;
  audioDuration?: number;
};

/** Recording viewport (CSS px). Zoom boxes from record_flow.ts are in these units. */
const VIEW_W = 1280;
const VIEW_H = 720;
/** Browser window geometry in composition units. */
const WIN_W = 1000;
const WIN_SCALE = WIN_W / VIEW_W;
const WIN_CONTENT_H = VIEW_H * WIN_SCALE;
const WIN_BAR = 30;
const WIN_TOP = 22;
const WIN_LEFT = (1280 - WIN_W) / 2;
const CAPTION_TOP = WIN_TOP + WIN_BAR + WIN_CONTENT_H + 12;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const fadeUp = (frame: number, delay: number) => ({
  opacity: interpolate(frame - delay, [0, 12], [0, 1], clamp),
  transform: `translateY(${interpolate(frame - delay, [0, 12], [24, 0], clamp)}px)`,
});

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

const SECTION_LABEL: Record<string, string> = {
  problem: "The problem",
  solution: "The solution",
  demo: "Live demo",
  next: "What's next",
};

function Stat({
  el,
  ctx,
  delay,
}: {
  el: Extract<Element, { type: "stat" }>;
  ctx: Ctx;
  delay: number;
}) {
  const frame = useDesignFrame();
  const fps = DESIGN_FPS;
  const src = ctx.sources.find((s) => s.id === el.source_id);
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 40 });
  const decimals = (String(el.value).split(".")[1] ?? "").length;
  const shown = (el.value * p).toFixed(decimals);
  const citation = !src
    ? ""
    : src.kind === "team-provided"
      ? "Source: the team"
      : `Source: ${src.source_name}${src.year ? `, ${src.year}` : ""}`;
  return (
    <div style={{ textAlign: "center", ...fadeUp(frame, delay) }}>
      <div
        style={{
          fontSize: ctx.kit.titleSize * 1.7,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          ...gradientText(ctx.kit.accent),
        }}
      >
        {shown}
        {el.unit ? (
          <span style={{ fontSize: ctx.kit.titleSize * 0.7 }}>
            {el.unit === "%" ? "%" : ` ${el.unit}`}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: ctx.kit.bodySize, marginTop: 16 }}>{el.label}</div>
      {citation && (
        <div style={{ fontSize: ctx.kit.citationSize, color: ctx.kit.muted, marginTop: 14 }}>
          {citation}
        </div>
      )}
    </div>
  );
}

function gradientText(brand: string): React.CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, #ffffff 35%, ${brandTint(brand, 80)})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

/** The recording at native viewport size; zoom/pan and the target highlight are applied in viewport px. */
function ClipContent({ el, ctx }: { el: Extract<Element, { type: "clip" }>; ctx: Ctx }) {
  const frame = useDesignFrame();
  const { fps: realFps, durationInFrames: realDuration } = useVideoConfig();
  const fps = DESIGN_FPS;
  const durationInFrames = (realDuration * DESIGN_FPS) / realFps;
  const m = ctx.media.clips[el.step_id];
  if (!m) return null;
  const clipFrames = Math.max(1, Math.floor(m.duration_s * realFps) - 1);
  const still = ctx.media.images[`shots/${el.step_id}.png`];
  let transform = "";
  let highlight: React.ReactNode = null;
  if (el.zoom === "target" && m.box) {
    // Spring zoom that also pans the target toward the centre; clamped so no edge of the video shows.
    const scale = Math.min(
      1.8,
      Math.max(1, Math.min(VIEW_W / (m.box.w * 2.2), VIEW_H / (m.box.h * 3))),
    );
    const k = spring({ frame: frame - 8, fps, config: { damping: 200 }, durationInFrames: 30 });
    const sc = 1 + (scale - 1) * k;
    const cx = m.box.x + m.box.w / 2;
    const cy = m.box.y + m.box.h / 2;
    const tx = Math.min(0, Math.max(VIEW_W - VIEW_W * sc, VIEW_W / 2 - cx * sc));
    const ty = Math.min(0, Math.max(VIEW_H - VIEW_H * sc, VIEW_H / 2 - cy * sc));
    transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
    const glow = interpolate(frame, [26, 38], [0, 1], clamp) * (0.75 + 0.25 * Math.sin(frame / 7));
    const pad = 8;
    highlight = (
      <div
        style={{
          position: "absolute",
          left: m.box.x - pad,
          top: m.box.y - pad,
          width: m.box.w + pad * 2,
          height: m.box.h + pad * 2,
          borderRadius: 12,
          border: `3px solid ${brandTint(ctx.kit.accent, 62)}`,
          boxShadow: `0 0 0 6px ${brandTint(ctx.kit.accent, 62, 0.2)}, 0 0 28px ${brandTint(ctx.kit.accent, 60)}`,
          opacity: glow,
        }}
      />
    );
  } else {
    // A slow push-in keeps wide shots alive.
    const sc = interpolate(frame, [0, durationInFrames], [1, 1.035], clamp);
    transform = `scale(${sc})`;
  }
  return (
    <div
      style={{
        position: "absolute",
        width: VIEW_W,
        height: VIEW_H,
        transformOrigin: el.zoom === "target" ? "0 0" : "50% 50%",
        transform,
      }}
    >
      <Sequence durationInFrames={clipFrames} layout="none">
        <OffthreadVideo
          src={m.url}
          muted
          playbackRate={el.speed ?? 1}
          style={{ position: "absolute", width: VIEW_W, height: VIEW_H }}
        />
      </Sequence>
      {/* Narration can outlast the clip: hold the step's final screenshot instead of going blank. */}
      {still && (
        <Sequence from={clipFrames} layout="none">
          <Img src={still} style={{ position: "absolute", width: VIEW_W, height: VIEW_H }} />
        </Sequence>
      )}
      {highlight}
    </div>
  );
}

/** Floating browser window that tilts in and holds the clip. */
function BrowserWindow({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  const frame = useDesignFrame();
  const fps = DESIGN_FPS;
  const p = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90, mass: 0.9 },
    durationInFrames: 36,
  });
  const tilt = interpolate(p, [0, 1], [10, 0]);
  const scale = interpolate(p, [0, 1], [0.93, 1]);
  const lift = interpolate(p, [0, 1], [26, 0]);
  return (
    <AbsoluteFill style={{ perspective: 1600 }}>
      <div
        style={{
          position: "absolute",
          left: WIN_LEFT,
          top: WIN_TOP,
          width: WIN_W,
          height: WIN_BAR + WIN_CONTENT_H,
          borderRadius: 14,
          overflow: "hidden",
          background: "#11151f",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: `0 40px 90px rgba(0,0,0,0.55), 0 0 70px ${brandTint(ctx.kit.accent, 55, 0.25)}`,
          transform: `translateY(${lift}px) rotateX(${tilt}deg) scale(${scale})`,
          transformOrigin: "50% 100%",
          opacity: interpolate(p, [0, 0.3], [0, 1], clamp),
        }}
      >
        <div
          style={{
            height: WIN_BAR,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: 7,
            background: "linear-gradient(#1d2230, #171b26)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />
          ))}
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                minWidth: 300,
                padding: "3px 16px",
                borderRadius: 7,
                background: "rgba(255,255,255,0.07)",
                color: "#c9d1e0",
                fontSize: 13,
                textAlign: "center",
                fontFamily: ctx.kit.font,
              }}
            >
              {host(ctx.url)}
            </div>
          </div>
          <div style={{ width: 47 }} />
        </div>
        <div
          style={{
            position: "relative",
            width: WIN_W,
            height: WIN_CONTENT_H,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: VIEW_W,
              height: VIEW_H,
              transformOrigin: "0 0",
              transform: `scale(${WIN_SCALE})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Captions({ text, ctx, band }: { text: string; ctx: Ctx; band: boolean }) {
  const frame = useDesignFrame();
  const fps = DESIGN_FPS;
  const audio = ctx.audioDuration;
  if (!text.trim() || !audio) return null;
  const t = frame / fps;
  const chunk = captionChunks(text, NARRATION_LEAD_S, audio).find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  const pop = interpolate(t - chunk.start, [0, 0.15], [0.6, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        top: band ? CAPTION_TOP : undefined,
        justifyContent: band ? "flex-start" : "flex-end",
        alignItems: "center",
        paddingBottom: band ? 0 : 34,
      }}
    >
      <div
        style={{
          maxWidth: 1060,
          padding: "8px 22px",
          borderRadius: 12,
          background: "rgba(8,11,20,0.62)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#fff",
          fontSize: 27,
          lineHeight: 1.3,
          fontWeight: 650,
          letterSpacing: "-0.01em",
          textAlign: "center",
          fontFamily: ctx.kit.font,
          opacity: pop,
          textShadow: "0 2px 10px rgba(0,0,0,0.5)",
        }}
      >
        {chunk.text}
      </div>
    </AbsoluteFill>
  );
}

function SectionChip({ label, ctx, frame }: { label: string; ctx: Ctx; frame: number }) {
  return (
    <div
      style={{
        padding: "7px 18px",
        borderRadius: 999,
        border: `1px solid ${brandTint(ctx.kit.accent, 65, 0.4)}`,
        background: `${brandTint(ctx.kit.accent, 50, 0.13)}`,
        color: brandTint(ctx.kit.accent, 80),
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        ...fadeUp(frame, 0),
      }}
    >
      {label}
    </div>
  );
}

function AccentBar({ ctx, frame, delay }: { ctx: Ctx; frame: number; delay: number }) {
  const fps = DESIGN_FPS;
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <div
      style={{
        width: 140 * p,
        height: 6,
        borderRadius: 3,
        background: `linear-gradient(90deg, ${brandTint(ctx.kit.accent, 60)}, ${brandTint(ctx.kit.accent, 82)})`,
        boxShadow: `0 0 18px ${brandTint(ctx.kit.accent, 60)}`,
      }}
    />
  );
}

function renderElement(
  el: Element,
  i: number,
  ctx: Ctx,
  frame: number,
  fps: number,
): React.ReactNode {
  const delay = 6 + i * 8;
  const { kit } = ctx;
  switch (el.type) {
    case "text":
      return (
        <div
          key={i}
          style={{
            fontSize:
              el.role === "title"
                ? kit.titleSize
                : el.role === "label"
                  ? kit.citationSize
                  : kit.bodySize,
            fontWeight: el.role === "title" ? 800 : 500,
            color: el.role === "title" ? undefined : kit.muted,
            maxWidth: 980,
            textAlign: "center",
            lineHeight: 1.3,
            ...(el.role === "title" ? gradientText(kit.accent) : {}),
            ...fadeUp(frame, delay + 8),
          }}
        >
          {el.text}
        </div>
      );
    case "kinetic_headline": {
      const words = el.text.split(/\s+/);
      return (
        <div
          key={i}
          style={{
            fontSize: words.length > 9 ? kit.titleSize * 0.85 : kit.titleSize,
            fontWeight: 800,
            maxWidth: 1120,
            textAlign: "center",
            lineHeight: 1.08,
            letterSpacing: "-0.035em",
          }}
        >
          {words.map((w, j) => {
            const p = spring({
              frame: frame - delay - j * 3,
              fps,
              config: { damping: 16, stiffness: 120 },
              durationInFrames: 22,
            });
            return (
              <span
                key={j}
                style={{
                  display: "inline-block",
                  marginRight: "0.24em",
                  opacity: interpolate(p, [0, 0.5], [0, 1], clamp),
                  transform: `translateY(${interpolate(p, [0, 1], [34, 0])}px)`,
                  filter: `blur(${interpolate(p, [0, 1], [10, 0])}px)`,
                  ...gradientText(kit.accent),
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      );
    }
    case "stat":
      return <Stat key={i} el={el} ctx={ctx} delay={delay} />;
    case "bullets":
      return (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            fontSize: kit.bodySize,
            maxWidth: 1000,
          }}
        >
          {el.items.map((it, j) => (
            <div
              key={j}
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                padding: "12px 22px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                ...fadeUp(frame, delay + j * 10),
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  flexShrink: 0,
                  background: brandTint(kit.accent, 65),
                  boxShadow: `0 0 12px ${brandTint(kit.accent, 60)}`,
                }}
              />
              <span>{it}</span>
            </div>
          ))}
        </div>
      );
    case "image": {
      const src = ctx.media.images[el.src];
      return src ? (
        <Img
          key={i}
          src={src}
          style={{
            maxWidth: "78%",
            maxHeight: "66%",
            objectFit: el.fit,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 30px 80px rgba(0,0,0,.5)",
            ...fadeUp(frame, delay),
          }}
        />
      ) : null;
    }
    case "device_frame":
      return (
        <div
          key={i}
          style={{
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(0,0,0,.45)",
            width: 1000,
            height: 562,
            position: "relative",
            ...fadeUp(frame, delay),
          }}
        >
          {renderElement(el.child, i, ctx, frame, fps)}
        </div>
      );
    default:
      // clip is rendered by the demo layout; node / arrow / icon / shape / diagram arrive with C11 + C16.
      return null;
  }
}

export function Scene({
  scene,
  ctx: baseCtx,
  index = 0,
}: {
  scene: SceneT;
  ctx: Ctx;
  index?: number;
}) {
  const frame = useDesignFrame();
  const { fps: realFps } = useVideoConfig();
  const fps = DESIGN_FPS;
  const audio = baseCtx.media.audio[scene.id];
  const ctx: Ctx = { ...baseCtx, audioDuration: audio?.duration_s };
  const { kit } = ctx;
  const voice = audio ? (
    <Sequence from={Math.round(NARRATION_LEAD_S * realFps)} layout="none">
      <Audio src={audio.url} />
    </Sequence>
  ) : null;
  // Offset the backdrop animation per scene so cuts don't look like a loop restarting.
  const backdrop = <Backdrop brand={kit.accent} base={kit.bg} drift={index * 137} />;
  const clip = scene.elements.find(
    (e): e is Extract<Element, { type: "clip" }> =>
      e.type === "clip" && !!ctx.media.clips[e.step_id],
  );

  if (scene.section === "end") {
    const pulse = 0.6 + 0.4 * Math.sin(frame / 6);
    return (
      <AbsoluteFill style={{ color: kit.fg, fontFamily: kit.font }}>
        {backdrop}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 26 }}>
          <div
            style={{
              fontSize: kit.titleSize * 1.15,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              ...gradientText(kit.accent),
              ...fadeUp(frame, 2),
            }}
          >
            Try it now
          </div>
          <div
            style={{
              fontSize: kit.bodySize + 6,
              fontWeight: 700,
              padding: "14px 34px",
              borderRadius: 999,
              color: "#fff",
              background: `linear-gradient(135deg, ${brandTint(kit.accent, 52)}, ${brandTint(kit.accent, 40)})`,
              boxShadow: `0 0 ${30 + 30 * pulse}px ${brandTint(kit.accent, 55, 0.67)}, inset 0 1px 0 rgba(255,255,255,0.3)`,
              ...fadeUp(frame, 10),
            }}
          >
            {host(ctx.url)}
          </div>
          {scene.elements.map((el, i) => renderElement(el, i + 2, ctx, frame, fps))}
        </AbsoluteFill>
        {ctx.credit && (
          <AbsoluteFill
            style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 30 }}
          >
            <div
              style={{
                fontSize: ctx.kit.citationSize,
                color: kit.muted,
                letterSpacing: "0.04em",
                ...fadeUp(frame, 18),
              }}
            >
              Made with Pit Crew
            </div>
          </AbsoluteFill>
        )}
        {voice}
      </AbsoluteFill>
    );
  }

  if (clip) {
    const overlays = scene.elements.filter((e) => e.type !== "clip");
    return (
      <AbsoluteFill style={{ color: kit.fg, fontFamily: kit.font }}>
        {backdrop}
        <BrowserWindow ctx={ctx}>
          <ClipContent el={clip} ctx={ctx} />
        </BrowserWindow>
        {overlays.length > 0 && (
          <AbsoluteFill
            style={{
              justifyContent: "flex-start",
              alignItems: "center",
              paddingTop: WIN_TOP + WIN_BAR + 24,
            }}
          >
            {overlays.map((el, i) => renderElement(el, i, ctx, frame, fps))}
          </AbsoluteFill>
        )}
        <Captions text={scene.narration} ctx={ctx} band />
        {voice}
      </AbsoluteFill>
    );
  }

  const label = SECTION_LABEL[scene.section];
  const headlineCount = scene.elements.filter(
    (e) => e.type === "kinetic_headline" || (e.type === "text" && e.role === "title"),
  ).length;
  return (
    <AbsoluteFill style={{ color: kit.fg, fontFamily: kit.font }}>
      {backdrop}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 26,
          padding: "60px 80px 120px",
        }}
      >
        {label && <SectionChip label={label} ctx={ctx} frame={frame} />}
        {scene.elements.map((el, i) => (
          <React.Fragment key={i}>
            {renderElement(el, i, ctx, frame, fps)}
            {headlineCount > 0 &&
              (el.type === "kinetic_headline" || (el.type === "text" && el.role === "title")) && (
                <AccentBar ctx={ctx} frame={frame} delay={18} />
              )}
          </React.Fragment>
        ))}
      </AbsoluteFill>
      <Captions text={scene.narration} ctx={ctx} band={false} />
      {voice}
    </AbsoluteFill>
  );
}
