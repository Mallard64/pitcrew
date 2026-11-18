/**
 * Bundled fonts (OFL, via @fontsource). The CSS ships the font files inside the Remotion bundle, so
 * renders never depend on fonts installed on the server or on a network fetch.
 */
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/instrument-serif";
import { continueRender, delayRender } from "remotion";
import { FONT_FAMILIES } from "./kits/default";

/**
 * Browsers load @font-face files lazily, so a frame could be captured with a fallback font.
 * Block the render until every kit font (latin subset) is loaded; a missing file only logs.
 */
let started = false;
export function waitForFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("Loading fonts");
  Promise.all(FONT_FAMILIES.flatMap((f) => [`400 40px "${f}"`, `700 40px "${f}"`].map((spec) => document.fonts.load(spec, "Aa"))))
    .catch((e) => console.warn("font load failed", e))
    .finally(() => continueRender(handle));
}
