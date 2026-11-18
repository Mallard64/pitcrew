/**
 * Animated brand backdrop shared by every scene: deep base colour, two slowly drifting glows
 * (brand hue and a shifted hue), a faint dot grid and a vignette. Pure CSS, so it renders crisp at any scale.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { hexToHsl } from "./kits/default";

export function Backdrop({ brand, base, drift = 0 }: { brand: string; base: string; drift?: number }) {
  const frame = useCurrentFrame() + drift;
  const [h, s] = hexToHsl(brand);
  const sat = Math.max(55, Math.min(90, s));
  const glowA = `hsla(${h}, ${sat}%, 58%, 0.55)`;
  const glowB = `hsla(${(h + 48) % 360}, ${sat}%, 55%, 0.38)`;
  const ax = 22 + Math.sin(frame / 90) * 8;
  const ay = 28 + Math.cos(frame / 110) * 6;
  const bx = 78 + Math.cos(frame / 100) * 8;
  const by = 74 + Math.sin(frame / 120) * 6;
  return (
    <AbsoluteFill style={{ background: base, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(42% 52% at ${ax}% ${ay}%, ${glowA}, transparent 70%), radial-gradient(46% 56% at ${bx}% ${by}%, ${glowB}, transparent 70%)`,
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
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.55))" }} />
    </AbsoluteFill>
  );
}
