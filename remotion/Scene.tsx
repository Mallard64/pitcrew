/**
 * Renders one scene in the plan's style kit (see kits/default.ts). Every visual choice (backdrop, type,
 * headline motion, window chrome, captions, label chip, accent, end card) comes from the kit, so
 * videos for different products look different.
 * - Demo scenes: the recording plays inside a window; zoom and the target highlight happen inside it,
 *   and captions sit in their own band below it, so they never cover the app.
 * - Title scenes: one element at a time: label, headline, accent, then stats/text/bullets.
 * The composition is laid out in 1280x720 units and rendered at a higher scale for crisp output.
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
import { accentOn, brandTint, type Kit } from "./kits/default";
import { DESIGN_FPS, useDesignFrame, type PitchVideoProps } from "./types";

type Ctx = {
  kit: Kit;
  sources: Source[];
  media: PitchVideoProps["media"];
  url: string;
  credit: boolean;
  audioDuration?: number;
  hideCaptions?: boolean;
};

/** Recording viewport (CSS px). Zoom boxes from record_flow.ts are in these units. */
const VIEW_W = 1280;
const VIEW_H = 720;
/** Window geometry in composition units. */
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

/** Headline colour treatment for the kit. */
function fill(kit: Kit): React.CSSProperties {
  if (kit.fill === "gradient")
    return {
      backgroundImage: `linear-gradient(180deg, #ffffff 35%, ${brandTint(kit.accent, 80)})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    };
  if (kit.fill === "brand") return { color: accentOn(kit) };
  return { color: kit.fg };
}

function headlineType(kit: Kit, size: number): React.CSSProperties {
  return {
    fontFamily: kit.displayFont,
    fontSize: size,
    fontWeight: kit.titleWeight,
    letterSpacing: kit.titleTracking,
    textTransform: kit.titleCase === "uppercase" ? "uppercase" : undefined,
    lineHeight: kit.titleCase === "uppercase" ? 0.98 : 1.08,
    textAlign: kit.align,
  };
}

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
  const { kit } = ctx;
  const src = ctx.sources.find((s) => s.id === el.source_id);
  const p = spring({
    frame: frame - delay - 6,
    fps,
    config: { damping: 200 },
    durationInFrames: 36,
  });
  const appear = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 12,
  });
  const decimals = (String(el.value).split(".")[1] ?? "").length;
  const shown = (el.value * p).toFixed(decimals);
  const citation = !src
    ? ""
    : src.kind === "team-provided"
      ? "Source: the team"
      : `Source: ${src.source_name}${src.year ? `, ${src.year}` : ""}`;
  return (
    <div
      style={{
        textAlign: kit.align,
        opacity: appear,
        transform: `scale(${interpolate(appear, [0, 1], [0.9, 1])})`,
        transformOrigin: kit.align === "left" ? "0 50%" : "50% 50%",
      }}
    >
      <div
        style={{
          ...headlineType(kit, kit.titleSize * 1.7),
          lineHeight: 1,
          ...(kit.fill === "solid"
            ? { color: kit.mode === "light" ? accentOn(kit) : kit.fg }
            : fill(kit)),
        }}
      >
        {shown}
        {el.unit ? (
          <span style={{ fontSize: kit.titleSize * 0.7 }}>
            {el.unit === "%" ? "%" : ` ${el.unit}`}
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: kit.bodySize,
          marginTop: 16,
          color: kit.fg,
          ...fadeUp(frame, delay + 14),
        }}
      >
        {el.label}
      </div>
      {citation && (
        <div
          style={{
            fontSize: kit.citationSize,
            color: kit.muted,
            marginTop: 14,
            ...fadeUp(frame, delay + 30),
          }}
        >
          {citation}
        </div>
      )}
    </div>
  );
}

/** The recorded step at native viewport size: the clip, then its final screenshot if narration runs longer. */
function Recording({ url, still, clipFrames, speed }: { url: string; still?: string; clipFrames: number; speed?: number }) {
  return (
    <>
      <Sequence durationInFrames={clipFrames} layout="none">
        <OffthreadVideo
          src={url}
          muted
          playbackRate={speed ?? 1}
          style={{ position: "absolute", width: VIEW_W, height: VIEW_H }}
        />
      </Sequence>
      {/* Narration can outlast the clip: hold the step's final screenshot instead of going blank. */}
      {still && (
        <Sequence from={clipFrames} layout="none">
          <Img src={still} style={{ position: "absolute", width: VIEW_W, height: VIEW_H }} />
        </Sequence>
      )}
    </>
  );
}

/** Ring drawn around the zoom target, styled per kit. */
function ringStyle(kit: Kit): React.CSSProperties {
  return kit.window === "brutal"
    ? { border: "4px solid #000", background: brandTint(kit.accent, 55, 0.18), boxShadow: "6px 6px 0 #000" }
    : kit.window === "terminal"
      ? { border: `2px dashed ${accentOn(kit)}`, boxShadow: `0 0 18px ${accentOn(kit, 0.6)}` }
      : {
          border: `3px solid ${accentOn(kit)}`,
          boxShadow: `0 0 0 6px ${accentOn(kit, 0.2)}, 0 0 28px ${accentOn(kit, 0.9)}`,
        };
}

type Box = { x: number; y: number; w: number; h: number };

/** Smallest area a close-up shows: a lone button is magnified together with the UI around it. */
const PANEL_MIN_W = 250;
const PANEL_MIN_H = 160;

/** Pads the target, grows it to the minimum area around its centre, and keeps it inside the viewport. */
export function panelBox(b: Box, pad = 10): Box {
  const w = Math.min(VIEW_W, Math.max(PANEL_MIN_W, b.w + pad * 2));
  const h = Math.min(VIEW_H, Math.max(PANEL_MIN_H, b.h + pad * 2));
  const x = Math.min(VIEW_W - w, Math.max(0, b.x + b.w / 2 - w / 2));
  const y = Math.min(VIEW_H - h, Math.max(0, b.y + b.h / 2 - h / 2));
  return { x, y, w, h };
}

/** Largest close-up of a panel, in viewport px, before it would cover too much of the window. */
const LOUPE_MAX_W = 640;
const LOUPE_MAX_H = 420;
const LOUPE_MAX_MAG = 2.6;

export type LoupeLayout = { mag: number; left: number; top: number; w: number; h: number };

const overlaps = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Where the magnified close-up goes: beside the panel (right, left, below, above, in that order) without
 * covering it. Shrinks the magnification until one fits; null when even 1.35x doesn't, or the panel is
 * already large on screen (then a camera zoom reads better).
 */
export function loupeLayout(panel: Box): LoupeLayout | null {
  const margin = 24;
  const gap = 20;
  for (let mag = Math.min(LOUPE_MAX_MAG, LOUPE_MAX_W / panel.w, LOUPE_MAX_H / panel.h); mag >= 1.35; mag *= 0.9) {
    const w = panel.w * mag;
    const h = panel.h * mag;
    const midY = Math.min(VIEW_H - h - margin, Math.max(margin, panel.y + panel.h / 2 - h / 2));
    const midX = Math.min(VIEW_W - w - margin, Math.max(margin, panel.x + panel.w / 2 - w / 2));
    const spots = [
      { left: VIEW_W - w - margin, top: midY },
      { left: margin, top: midY },
      { left: midX, top: VIEW_H - h - margin },
      { left: midX, top: margin },
    ];
    for (const sp of spots) {
      const fits = sp.left >= margin - 0.5 && sp.top >= margin - 0.5 && sp.left + w <= VIEW_W - margin + 0.5 && sp.top + h <= VIEW_H - margin + 0.5;
      if (fits && !overlaps({ x: sp.left, y: sp.top, w, h }, panel, gap)) return { mag, w, h, ...sp };
    }
  }
  return null;
}

/** The recording at native viewport size; zoom/pan and the target highlight are applied in viewport px. */
function ClipContent({ el, ctx }: { el: Extract<Element, { type: "clip" }>; ctx: Ctx }) {
  const frame = useDesignFrame();
  const { fps: realFps, durationInFrames: realDuration } = useVideoConfig();
  const fps = DESIGN_FPS;
  const durationInFrames = (realDuration * DESIGN_FPS) / realFps;
  const { kit } = ctx;
  const m = ctx.media.clips[el.step_id];
  if (!m) return null;
  const clipFrames = Math.max(1, Math.floor(m.duration_s * realFps) - 1);
  const still = ctx.media.images[`shots/${el.step_id}.png`];
  const rec = <Recording url={m.url} still={still} clipFrames={clipFrames} speed={el.speed} />;
  const pulse = 0.75 + 0.25 * Math.sin(frame / 7);
  const panel = m.box ? panelBox(m.box) : null;
  const at = el.zoom === "inspect" && panel ? loupeLayout(panel) : null;

  if (panel && at) {
    // Inspect: the whole UI stays in view (so viewers see what changed where), the panel is spotlit,
    // and a magnified live copy of it pops out on the other side of the window.
    const mag = at.mag;
    const k = spring({ frame: frame - 14, fps, config: { damping: 18, mass: 0.7 }, durationInFrames: 26 });
    const out = interpolate(frame, [durationInFrames - 14, durationInFrames - 2], [1, 0], clamp);
    const show = Math.min(k, out);
    const dim = interpolate(frame, [8, 22], [0, 0.42], clamp) * out;
    // The close-up grows out of the panel toward its spot.
    const gx = (panel.x + panel.w / 2 - (at.left + at.w / 2)) * (1 - show);
    const gy = (panel.y + panel.h / 2 - (at.top + at.h / 2)) * (1 - show);
    const sc = 0.35 + 0.65 * show;
    return (
      <div style={{ position: "absolute", width: VIEW_W, height: VIEW_H, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            width: VIEW_W,
            height: VIEW_H,
            transform: `scale(${interpolate(frame, [0, durationInFrames], [1, 1.03], clamp)})`,
          }}
        >
          {rec}
        </div>
        <div
          style={{
            position: "absolute",
            left: panel.x,
            top: panel.y,
            width: panel.w,
            height: panel.h,
            borderRadius: Math.min(10, kit.radius),
            boxShadow: `0 0 0 4000px rgba(0,0,0,${dim})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: panel.x - 4,
            top: panel.y - 4,
            width: panel.w + 8,
            height: panel.h + 8,
            borderRadius: Math.min(12, kit.radius + 2),
            opacity: (dim / 0.42) * (kit.window === "brutal" ? 1 : pulse),
            ...ringStyle(kit),
          }}
        />
        <div
          style={{
            position: "absolute",
            left: at.left,
            top: at.top,
            width: at.w,
            height: at.h,
            overflow: "hidden",
            borderRadius: Math.min(14, kit.radius + 4),
            opacity: show > 0.02 ? 1 : 0,
            transform: `translate(${gx}px, ${gy}px) scale(${sc})`,
            background: "#fff",
            border: kit.window === "brutal" ? "4px solid #000" : `3px solid ${accentOn(kit)}`,
            boxShadow:
              kit.window === "brutal"
                ? "10px 10px 0 #000"
                : `0 24px 60px rgba(0,0,0,0.55), 0 0 0 6px ${accentOn(kit, 0.18)}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: VIEW_W,
              height: VIEW_H,
              transformOrigin: "0 0",
              transform: `translate(${-panel.x * mag}px, ${-panel.y * mag}px) scale(${mag})`,
            }}
          >
            {rec}
          </div>
        </div>
      </div>
    );
  }

  let transform = "";
  let highlight: React.ReactNode = null;
  const zoomed = (el.zoom === "target" || el.zoom === "inspect") && m.box;
  if (zoomed && m.box) {
    // Spring zoom that also pans the target toward the centre; clamped so no edge of the video shows.
    // Inspect on a panel too large for a close-up gets a deeper camera zoom instead.
    const scale = Math.min(
      el.zoom === "inspect" ? 2.2 : 1.8,
      Math.max(1, Math.min(VIEW_W / (m.box.w * (el.zoom === "inspect" ? 1.3 : 2.2)), VIEW_H / (m.box.h * (el.zoom === "inspect" ? 1.4 : 3)))),
    );
    const k = spring({ frame: frame - 8, fps, config: { damping: 200 }, durationInFrames: 30 });
    const sc = 1 + (scale - 1) * k;
    const cx = m.box.x + m.box.w / 2;
    const cy = m.box.y + m.box.h / 2;
    const tx = Math.min(0, Math.max(VIEW_W - VIEW_W * sc, VIEW_W / 2 - cx * sc));
    const ty = Math.min(0, Math.max(VIEW_H - VIEW_H * sc, VIEW_H / 2 - cy * sc));
    transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
    const on = interpolate(frame, [26, 38], [0, 1], clamp);
    const pad = 8;
    highlight = (
      <div
        style={{
          position: "absolute",
          left: m.box.x - pad,
          top: m.box.y - pad,
          width: m.box.w + pad * 2,
          height: m.box.h + pad * 2,
          borderRadius: Math.min(12, kit.radius),
          opacity: on * (kit.window === "brutal" ? 1 : pulse),
          ...ringStyle(kit),
        }}
      />
    );
  } else {
    // A slow push-in keeps wide shots alive.
    transform = `scale(${interpolate(frame, [0, durationInFrames], [1, 1.035], clamp)})`;
  }
  return (
    <div
      style={{
        position: "absolute",
        width: VIEW_W,
        height: VIEW_H,
        transformOrigin: zoomed ? "0 0" : "50% 50%",
        transform,
      }}
    >
      {rec}
      {highlight}
    </div>
  );
}

/** Window chrome per kit: macOS dark/light, terminal, neo-brutalist, frosted glass. */
function chrome(kit: Kit) {
  switch (kit.window) {
    case "mac-light":
      return {
        frame: {
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.12)",
          boxShadow: "0 30px 70px rgba(40,30,10,0.18), 0 2px 6px rgba(0,0,0,0.06)",
        },
        bar: {
          background: "linear-gradient(#f3f3f3, #e8e8e8)",
          borderBottom: "1px solid rgba(0,0,0,0.1)",
        },
        url: { background: "#fff", color: "#555", border: "1px solid rgba(0,0,0,0.08)" },
        dots: true,
      };
    case "terminal":
      return {
        frame: {
          background: "#000",
          border: `1px solid ${accentOn(kit, 0.6)}`,
          boxShadow: `0 0 40px ${accentOn(kit, 0.25)}, 0 30px 80px rgba(0,0,0,0.6)`,
        },
        bar: { background: "#0b0f14", borderBottom: `1px solid ${accentOn(kit, 0.35)}` },
        url: { background: "transparent", color: accentOn(kit), border: "none" },
        dots: false,
      };
    case "brutal":
      return {
        frame: { background: "#fff", border: "4px solid #000", boxShadow: "16px 16px 0 #000" },
        bar: { background: "#fff", borderBottom: "4px solid #000" },
        url: {
          background: "#000",
          color: "#fff",
          border: "none",
          fontWeight: 800,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        },
        dots: false,
      };
    case "glass":
      return {
        frame: {
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.45)",
          boxShadow: "0 30px 90px rgba(10,5,40,0.45)",
          backdropFilter: "blur(18px)",
          padding: 8,
        },
        bar: { background: "transparent" },
        url: {
          background: "rgba(255,255,255,0.18)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.3)",
        },
        dots: true,
      };
    default:
      return {
        frame: {
          background: "#11151f",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: `0 40px 90px rgba(0,0,0,0.55), 0 0 70px ${brandTint(kit.accent, 55, 0.25)}`,
        },
        bar: {
          background: "linear-gradient(#1d2230, #171b26)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        },
        url: { background: "rgba(255,255,255,0.07)", color: "#c9d1e0", border: "none" },
        dots: true,
      };
  }
}

function BrowserWindow({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  const frame = useDesignFrame();
  const fps = DESIGN_FPS;
  const { kit } = ctx;
  const c = chrome(kit);
  const p = spring({
    frame,
    fps,
    config:
      kit.window === "brutal"
        ? { damping: 12, stiffness: 160 }
        : { damping: 18, stiffness: 90, mass: 0.9 },
    durationInFrames: 36,
  });
  // Each kit enters differently: tilt-up (default), slide-in from the left (brutal), plain rise (terminal).
  const enter =
    kit.window === "brutal"
      ? `translateX(${interpolate(p, [0, 1], [-60, 0])}px)`
      : kit.window === "terminal"
        ? `translateY(${interpolate(p, [0, 1], [14, 0])}px)`
        : `translateY(${interpolate(p, [0, 1], [26, 0])}px) rotateX(${interpolate(p, [0, 1], [10, 0])}deg) scale(${interpolate(p, [0, 1], [0.93, 1])})`;
  const pad = (c.frame as { padding?: number }).padding ?? 0;
  return (
    <AbsoluteFill style={{ perspective: 1600 }}>
      <div
        style={{
          position: "absolute",
          left: WIN_LEFT - pad,
          top: WIN_TOP - pad,
          width: WIN_W + pad * 2,
          height: WIN_BAR + WIN_CONTENT_H + pad * 2,
          borderRadius: kit.radius,
          overflow: "hidden",
          transform: enter,
          transformOrigin: "50% 100%",
          opacity: interpolate(p, [0, 0.3], [0, 1], clamp),
          ...c.frame,
        }}
      >
        <div
          style={{
            height: WIN_BAR,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: 7,
            ...c.bar,
          }}
        >
          {c.dots
            ? ["#ff5f57", "#febc2e", "#28c840"].map((d) => (
                <div key={d} style={{ width: 11, height: 11, borderRadius: 6, background: d }} />
              ))
            : null}
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: kit.window === "terminal" ? "flex-start" : "center",
            }}
          >
            <div
              style={{
                minWidth: kit.window === "terminal" ? 0 : 300,
                padding: "3px 16px",
                borderRadius: Math.min(7, kit.radius),
                fontSize: 13,
                textAlign: "center",
                fontFamily: kit.font,
                ...c.url,
              }}
            >
              {kit.window === "terminal" ? `● ~/${host(ctx.url)}` : host(ctx.url)}
            </div>
          </div>
          {c.dots ? <div style={{ width: 47 }} /> : null}
        </div>
        <div
          style={{
            position: "relative",
            width: WIN_W,
            height: WIN_CONTENT_H,
            overflow: "hidden",
            background: "#fff",
            borderRadius: kit.window === "glass" ? kit.radius - 8 : 0,
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

function captionStyle(kit: Kit): React.CSSProperties {
  switch (kit.caption) {
    case "light-card":
      return {
        background: "rgba(255,255,255,0.94)",
        color: kit.fg,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 8px 24px rgba(40,30,10,0.12)",
        borderRadius: 10,
      };
    case "mono-bar":
      return {
        background: "rgba(0,0,0,0.85)",
        color: kit.fg,
        borderLeft: `4px solid ${accentOn(kit)}`,
        borderRadius: 2,
        textAlign: "left",
      };
    case "block":
      return {
        background: "#000",
        color: "#fff",
        borderRadius: 0,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        fontSize: 25,
      };
    case "glass":
      return {
        background: "rgba(255,255,255,0.16)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.35)",
        backdropFilter: "blur(14px)",
        borderRadius: 18,
        textShadow: "0 1px 8px rgba(0,0,0,0.35)",
      };
    default:
      return {
        background: "rgba(8,11,20,0.62)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        textShadow: "0 2px 10px rgba(0,0,0,0.5)",
      };
  }
}

function Captions({ text, ctx, band }: { text: string; ctx: Ctx; band: boolean }) {
  const frame = useDesignFrame();
  const fps = DESIGN_FPS;
  const { kit } = ctx;
  const audio = ctx.audioDuration;
  if (!text.trim() || !audio || ctx.hideCaptions) return null;
  const t = frame / fps;
  const chunk = captionChunks(text, NARRATION_LEAD_S, audio).find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  const pop = interpolate(t - chunk.start, [0, 0.15], [0.6, 1], clamp);
  const left = !band && kit.align === "left";
  return (
    <AbsoluteFill
      style={{
        top: band ? CAPTION_TOP : undefined,
        justifyContent: band ? "flex-start" : "flex-end",
        alignItems: left ? "flex-start" : "center",
        paddingBottom: band ? 0 : 34,
        paddingLeft: left ? 110 : 0,
      }}
    >
      <div
        style={{
          maxWidth: 1060,
          padding: "8px 22px",
          fontSize: 27,
          lineHeight: 1.3,
          fontWeight: 650,
          letterSpacing: "-0.01em",
          textAlign: "center",
          fontFamily: kit.font,
          opacity: pop,
          ...captionStyle(kit),
        }}
      >
        {chunk.text}
      </div>
    </AbsoluteFill>
  );
}

function SectionChip({ label, ctx, frame }: { label: string; ctx: Ctx; frame: number }) {
  const { kit } = ctx;
  const anim = fadeUp(frame, 0);
  switch (kit.chip) {
    case "tag":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: accentOn(kit),
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            ...anim,
          }}
        >
          <span style={{ width: 36, height: 2, background: accentOn(kit) }} />
          {label}
        </div>
      );
    case "mono":
      return (
        <div
          style={{ fontFamily: kit.font, color: accentOn(kit), fontSize: 19, ...anim }}
        >{`// ${label.toLowerCase()}`}</div>
      );
    case "block":
      return (
        <div
          style={{
            background: "#000",
            color: "#fff",
            padding: "8px 16px",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            ...anim,
          }}
        >
          {label}
        </div>
      );
    default: {
      const light = kit.mode === "light";
      return (
        <div
          style={{
            padding: "7px 18px",
            borderRadius: 999,
            border: `1px solid ${light ? accentOn(kit, 0.4) : brandTint(kit.accent, 65, 0.4)}`,
            background:
              kit.backdrop === "aurora"
                ? "rgba(255,255,255,0.16)"
                : brandTint(kit.accent, 50, 0.13),
            color:
              kit.backdrop === "aurora"
                ? "#fff"
                : light
                  ? accentOn(kit)
                  : brandTint(kit.accent, 80),
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            ...anim,
          }}
        >
          {label}
        </div>
      );
    }
  }
}

function AccentBar({ ctx, frame, delay }: { ctx: Ctx; frame: number; delay: number }) {
  const { kit } = ctx;
  const p = spring({
    frame: frame - delay,
    fps: DESIGN_FPS,
    config: { damping: 200 },
    durationInFrames: 24,
  });
  if (kit.bar === "none") return null;
  if (kit.bar === "block")
    return <div style={{ width: 160 * p, height: 16, background: "#000" }} />;
  if (kit.bar === "line") return <div style={{ width: 72 * p, height: 3, background: kit.fg }} />;
  return (
    <div
      style={{
        width: 140 * p,
        height: 6,
        borderRadius: 3,
        background: `linear-gradient(90deg, ${brandTint(kit.accent, 60)}, ${brandTint(kit.accent, 82)})`,
        boxShadow: `0 0 18px ${brandTint(kit.accent, 60)}`,
      }}
    />
  );
}

const isHeadline = (el: Element) =>
  el.type === "kinetic_headline" || (el.type === "text" && el.role === "title");

/** How long an element's entrance takes, in design frames (30fps). */
function entranceFrames(el: Element, kit: Kit): number {
  switch (el.type) {
    case "kinetic_headline":
      return kit.headlineMotion === "typewriter"
        ? Math.min(48, el.text.length * 1.1) + 8
        : el.text.split(/\s+/).length * 3 + 14;
    case "stat":
      return 36;
    case "bullets":
      return el.items.length * 10 + 10;
    default:
      return 12;
  }
}

function Headline({
  text,
  kit,
  frame,
  delay,
}: {
  text: string;
  kit: Kit;
  frame: number;
  delay: number;
}) {
  const words = text.split(/\s+/);
  const size = (words.length > 9 ? 0.85 : 1) * kit.titleSize;
  const style: React.CSSProperties = {
    ...headlineType(kit, size),
    maxWidth: kit.align === "left" ? 1060 : 1120,
  };
  if (kit.headlineMotion === "typewriter") {
    // Characters appear at a steady rate, with a blinking block cursor.
    const perChar = Math.min(1.1, 48 / Math.max(1, text.length));
    const shown = Math.max(0, Math.min(text.length, Math.floor((frame - delay) / perChar)));
    const blink = Math.floor(frame / 8) % 2 === 0;
    return (
      <div style={{ ...style, ...fill(kit) }}>
        <span>{text.slice(0, shown)}</span>
        <span style={{ visibility: "hidden" }}>{text.slice(shown)}</span>
        <span
          style={{
            display: "inline-block",
            width: "0.55em",
            height: "0.9em",
            marginLeft: 4,
            verticalAlign: "-0.08em",
            background: accentOn(kit),
            opacity: blink ? 1 : 0,
          }}
        />
      </div>
    );
  }
  return (
    <div style={style}>
      {words.map((w, j) => {
        const p =
          kit.headlineMotion === "slam"
            ? spring({
                frame: frame - delay - j * 3,
                fps: DESIGN_FPS,
                config: { damping: 11, stiffness: 220 },
                durationInFrames: 14,
              })
            : spring({
                frame: frame - delay - j * 3,
                fps: DESIGN_FPS,
                config: { damping: 200 },
                durationInFrames: 16,
              });
        const motion =
          kit.headlineMotion === "slam"
            ? {
                opacity: interpolate(p, [0, 0.4], [0, 1], clamp),
                transform: `scale(${interpolate(p, [0, 1], [1.35, 1])})`,
              }
            : {
                opacity: interpolate(p, [0, 0.7], [0, 1], clamp),
                transform: `translateY(${interpolate(p, [0, 1], [0.32, 0])}em)`,
              };
        return (
          <span
            key={j}
            style={{
              display: "inline-block",
              marginRight: "0.24em",
              transformOrigin: "50% 60%",
              ...motion,
              ...fill(kit),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

function renderElement(
  el: Element,
  i: number,
  ctx: Ctx,
  frame: number,
  fps: number,
  startAt?: number,
): React.ReactNode {
  const delay = startAt ?? 6 + i * 8;
  const { kit } = ctx;
  const light = kit.mode === "light";
  switch (el.type) {
    case "text":
      return el.role === "title" ? (
        <div
          key={i}
          style={{
            ...headlineType(kit, kit.titleSize),
            maxWidth: 1060,
            ...fill(kit),
            ...fadeUp(frame, delay),
          }}
        >
          {el.text}
        </div>
      ) : (
        <div
          key={i}
          style={{
            fontSize: el.role === "label" ? kit.citationSize : kit.bodySize,
            fontWeight: 500,
            color: kit.muted,
            maxWidth: 980,
            textAlign: kit.align,
            lineHeight: 1.3,
            ...fadeUp(frame, delay),
          }}
        >
          {el.text}
        </div>
      );
    case "kinetic_headline":
      return <Headline key={i} text={el.text} kit={kit} frame={frame} delay={delay} />;
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
            color: kit.fg,
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
                borderRadius: kit.radius,
                background:
                  kit.window === "brutal"
                    ? "#fff"
                    : light
                      ? "rgba(255,255,255,0.75)"
                      : "rgba(255,255,255,0.06)",
                color: kit.window === "brutal" ? "#000" : kit.fg,
                border:
                  kit.window === "brutal"
                    ? "3px solid #000"
                    : light
                      ? "1px solid rgba(0,0,0,0.08)"
                      : "1px solid rgba(255,255,255,0.1)",
                boxShadow: kit.window === "brutal" ? "6px 6px 0 #000" : undefined,
                fontFamily: kit.font,
                ...fadeUp(frame, delay + j * 10),
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: kit.radius ? 5 : 0,
                  flexShrink: 0,
                  background: accentOn(kit),
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
            borderRadius: kit.radius,
            border: light ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 30px 80px rgba(0,0,0,.35)",
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
            borderRadius: kit.radius,
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

function EndCard({
  ctx,
  frame,
  scene,
  fps,
}: {
  ctx: Ctx;
  frame: number;
  scene: SceneT;
  fps: number;
}) {
  const { kit } = ctx;
  const pulse = 0.6 + 0.4 * Math.sin(frame / 6);
  const url = host(ctx.url);
  const cta: React.CSSProperties =
    kit.window === "brutal"
      ? {
          background: "#000",
          color: "#fff",
          padding: "16px 34px",
          fontWeight: 900,
          textTransform: "uppercase",
          boxShadow: "10px 10px 0 rgba(0,0,0,0.35)",
        }
      : kit.window === "terminal"
        ? { color: accentOn(kit), fontFamily: kit.font, padding: "10px 0" }
        : kit.window === "glass"
          ? {
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.45)",
              color: "#fff",
              padding: "14px 34px",
              borderRadius: 999,
              backdropFilter: "blur(14px)",
            }
          : kit.mode === "light"
            ? {
                background: brandTint(kit.accent, 38),
                color: "#fff",
                padding: "14px 34px",
                borderRadius: kit.radius,
              }
            : {
                background: `linear-gradient(135deg, ${brandTint(kit.accent, 52)}, ${brandTint(kit.accent, 40)})`,
                color: "#fff",
                padding: "14px 34px",
                borderRadius: 999,
                boxShadow: `0 0 ${30 + 30 * pulse}px ${brandTint(kit.accent, 55, 0.67)}, inset 0 1px 0 rgba(255,255,255,0.3)`,
              };
  const left = kit.align === "left";
  const blink = Math.floor(frame / 8) % 2 === 0;
  return (
    <AbsoluteFill style={{ color: kit.fg, fontFamily: kit.font }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: left ? "flex-start" : "center",
          gap: 26,
          paddingLeft: left ? 110 : 0,
        }}
      >
        <div
          style={{ ...headlineType(kit, kit.titleSize * 1.15), ...fill(kit), ...fadeUp(frame, 2) }}
        >
          Try it now
        </div>
        <div style={{ fontSize: kit.bodySize + 6, fontWeight: 700, ...cta, ...fadeUp(frame, 10) }}>
          {kit.window === "terminal" ? (
            <>
              {`$ open ${url}`}
              <span
                style={{
                  display: "inline-block",
                  width: "0.55em",
                  height: "0.9em",
                  marginLeft: 6,
                  verticalAlign: "-0.08em",
                  background: accentOn(kit),
                  opacity: blink ? 1 : 0,
                }}
              />
            </>
          ) : (
            url
          )}
        </div>
        {scene.elements.map((el, i) => renderElement(el, i + 2, ctx, frame, fps))}
      </AbsoluteFill>
      {ctx.credit && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: left ? "flex-start" : "center",
            paddingBottom: 30,
            paddingLeft: left ? 110 : 0,
          }}
        >
          <div
            style={{
              fontSize: kit.citationSize,
              color: kit.muted,
              letterSpacing: "0.04em",
              ...fadeUp(frame, 18),
            }}
          >
            Made with Pit Crew
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
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
  const backdrop = <Backdrop kit={kit} drift={index * 137} />;
  const clip = scene.elements.find(
    (e): e is Extract<Element, { type: "clip" }> =>
      e.type === "clip" && !!ctx.media.clips[e.step_id],
  );

  if (scene.section === "end") {
    return (
      <AbsoluteFill>
        {backdrop}
        <EndCard ctx={ctx} frame={frame} scene={scene} fps={fps} />
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
  // One thing at a time: each element starts when the previous one has (nearly) finished.
  const schedule: number[] = [];
  let at = label ? 8 : 2;
  for (const el of scene.elements) {
    schedule.push(at);
    at += entranceFrames(el, kit) + (isHeadline(el) ? 8 : 2);
  }
  const left = kit.align === "left";
  return (
    <AbsoluteFill style={{ color: kit.fg, fontFamily: kit.font }}>
      {backdrop}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: left ? "flex-start" : "center",
          gap: 26,
          padding: left ? "60px 110px 120px" : "60px 80px 120px",
        }}
      >
        {label && <SectionChip label={label} ctx={ctx} frame={frame} />}
        {scene.elements.map((el, i) => (
          <React.Fragment key={i}>
            {renderElement(el, i, ctx, frame, fps, schedule[i])}
            {isHeadline(el) && (
              <AccentBar
                ctx={ctx}
                frame={frame}
                delay={schedule[i] + entranceFrames(el, kit) - 4}
              />
            )}
          </React.Fragment>
        ))}
      </AbsoluteFill>
      <Captions text={scene.narration} ctx={ctx} band={false} />
      {voice}
    </AbsoluteFill>
  );
}
