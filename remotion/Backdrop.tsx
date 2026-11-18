/**
 * Animated backdrop per style kit. Pure CSS, so it renders crisp at any output scale.
 * glow: dark + two drifting brand glows · paper: cream with soft brand wash and fibres · grid: black
 * with a moving line grid and scanlines · brand: full brand field with slow diagonal stripes ·
 * aurora: vivid moving multi-hue mesh · plain: near-white with a hairline grid.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { brandTint, hexToHsl, type Kit } from "./kits/default";
import { useDesignFrame } from "./types";

export function Backdrop({ kit, drift = 0 }: { kit: Kit; drift?: number }) {
  const frame = useDesignFrame() + drift;
  const [h, s] = hexToHsl(kit.accent);
  const sat = Math.max(55, Math.min(90, s));
  const sin = (d: number, a: number) => Math.sin(frame / d) * a;
  const cos = (d: number, a: number) => Math.cos(frame / d) * a;

  switch (kit.backdrop) {
    case "paper":
      return (
        <AbsoluteFill style={{ background: kit.bg }}>
          <AbsoluteFill
            style={{
              background: `radial-gradient(50% 60% at ${80 + sin(140, 4)}% ${20 + cos(160, 4)}%, hsla(${h}, ${sat}%, 70%, 0.22), transparent 70%)`,
            }}
          />
          {/* fine horizontal fibres, like uncoated paper */}
          <AbsoluteFill
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(60,40,10,0.035) 0px, rgba(60,40,10,0.035) 1px, transparent 1px, transparent 4px)",
            }}
          />
          <AbsoluteFill
            style={{
              background:
                "radial-gradient(120% 100% at 50% 50%, transparent 60%, rgba(80,60,30,0.12))",
            }}
          />
        </AbsoluteFill>
      );
    case "grid":
      return (
        <AbsoluteFill style={{ background: kit.bg }}>
          <AbsoluteFill
            style={{
              backgroundImage: `linear-gradient(${brandTint(kit.accent, 55, 0.12)} 1px, transparent 1px), linear-gradient(90deg, ${brandTint(kit.accent, 55, 0.12)} 1px, transparent 1px)`,
              backgroundSize: "48px 48px",
              backgroundPosition: `0px ${(frame * 0.4) % 48}px`,
              maskImage: "radial-gradient(75% 75% at 50% 45%, black, transparent)",
              WebkitMaskImage: "radial-gradient(75% 75% at 50% 45%, black, transparent)",
            }}
          />
          <AbsoluteFill
            style={{
              background: `radial-gradient(40% 40% at 15% 85%, ${brandTint(kit.accent, 50, 0.16)}, transparent 70%)`,
            }}
          />
          <AbsoluteFill
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)",
            }}
          />
        </AbsoluteFill>
      );
    case "brand": {
      const field = `hsl(${h}, ${Math.max(60, sat)}%, 44%)`;
      return (
        <AbsoluteFill style={{ background: field, overflow: "hidden" }}>
          <AbsoluteFill
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(0,0,0,0.07) 0px, rgba(0,0,0,0.07) 28px, transparent 28px, transparent 56px)",
              backgroundPosition: `${(frame * 0.6) % 80}px 0px`,
            }}
          />
          <AbsoluteFill
            style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.28))" }}
          />
        </AbsoluteFill>
      );
    }
    case "aurora": {
      const c1 = `hsla(${h}, 90%, 60%, 0.85)`;
      const c2 = `hsla(${(h + 70) % 360}, 90%, 60%, 0.75)`;
      const c3 = `hsla(${(h + 300) % 360}, 85%, 60%, 0.7)`;
      return (
        <AbsoluteFill style={{ background: kit.bg, overflow: "hidden" }}>
          <AbsoluteFill
            style={{
              background: [
                `radial-gradient(40% 50% at ${25 + sin(70, 12)}% ${30 + cos(90, 10)}%, ${c1}, transparent 70%)`,
                `radial-gradient(45% 55% at ${75 + cos(80, 12)}% ${35 + sin(60, 12)}%, ${c2}, transparent 70%)`,
                `radial-gradient(50% 50% at ${50 + sin(100, 15)}% ${85 + cos(75, 8)}%, ${c3}, transparent 70%)`,
              ].join(", "),
              filter: "blur(40px) saturate(1.2)",
            }}
          />
          <AbsoluteFill style={{ background: "rgba(8,6,24,0.28)" }} />
        </AbsoluteFill>
      );
    }
    case "plain":
      return (
        <AbsoluteFill style={{ background: kit.bg }}>
          <AbsoluteFill
            style={{
              backgroundImage:
                "linear-gradient(rgba(0,0,0,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.045) 1px, transparent 1px)",
              backgroundSize: "80px 80px",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 8,
              height: "100%",
              background: brandTint(kit.accent, 45),
            }}
          />
        </AbsoluteFill>
      );
    default: {
      // glow
      const glowA = `hsla(${h}, ${sat}%, 58%, 0.55)`;
      const glowB = `hsla(${(h + 48) % 360}, ${sat}%, 55%, 0.38)`;
      return (
        <AbsoluteFill style={{ background: kit.bg, overflow: "hidden" }}>
          <AbsoluteFill
            style={{
              background: `radial-gradient(42% 52% at ${22 + sin(90, 8)}% ${28 + cos(110, 6)}%, ${glowA}, transparent 70%), radial-gradient(46% 56% at ${78 + cos(100, 8)}% ${74 + sin(120, 6)}%, ${glowB}, transparent 70%)`,
              filter: "blur(30px)",
            }}
          />
          <AbsoluteFill
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1.2px)",
              backgroundSize: "26px 26px",
              backgroundPosition: `${(frame * 0.15) % 26}px 0px`,
              maskImage: "radial-gradient(70% 70% at 50% 50%, black, transparent)",
              WebkitMaskImage: "radial-gradient(70% 70% at 50% 50%, black, transparent)",
            }}
          />
          <AbsoluteFill
            style={{
              background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.55))",
            }}
          />
        </AbsoluteFill>
      );
    }
  }
}
