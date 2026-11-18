/**
 * Style kits (C14): each is a complete look (backdrop, type, motion, window chrome, captions, end card),
 * so two pitch videos don't look like the same template. The agent picks one by id in the plan
 * (`style_kit`); an unknown id or "default" falls back to a seed-based pick.
 */
export type KitId = "midnight" | "paper" | "terminal" | "poster" | "aurora" | "clean" | "studio" | "blueprint";

export type Kit = {
  id: KitId;
  mode: "dark" | "light";
  /** Brand colour from the plan; every kit derives its accents from it. */
  accent: string;
  bg: string;
  fg: string;
  muted: string;
  font: string;
  displayFont: string;
  titleSize: number;
  bodySize: number;
  citationSize: number;
  titleWeight: number;
  titleCase: "none" | "uppercase";
  titleTracking: string;
  align: "center" | "left";
  backdrop: "glow" | "paper" | "grid" | "brand" | "aurora" | "plain";
  /** How headline text is filled. */
  fill: "gradient" | "solid" | "brand";
  headlineMotion: "fade-up" | "typewriter" | "slam";
  window: "mac-dark" | "mac-light" | "terminal" | "brutal" | "glass";
  radius: number;
  caption: "dark-pill" | "light-card" | "mono-bar" | "block" | "glass";
  chip: "pill" | "tag" | "mono" | "block";
  bar: "glow" | "line" | "block" | "none";
};

// Fonts are bundled with the renderer (remotion/fonts.ts, @fontsource), so the server renders the
// same type as a laptop. The fallbacks only matter if a font file fails to load.
const SANS = "'Inter Variable', Inter, -apple-system, 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif";
const SERIF = "'Fraunces Variable', 'Iowan Old Style', Georgia, 'DejaVu Serif', serif";
const MONO = "'JetBrains Mono Variable', 'SF Mono', Menlo, 'DejaVu Sans Mono', monospace";
const GROTESK = "'Space Grotesk Variable', 'Inter Variable', 'DejaVu Sans', sans-serif";
const BRICOLAGE = "'Bricolage Grotesque Variable', 'Inter Variable', 'DejaVu Sans', sans-serif";
const DISPLAY_SERIF = "'Instrument Serif', 'Fraunces Variable', Georgia, 'DejaVu Serif', serif";

/** Every font family the kits use, for the renderer to wait on before drawing frames. */
export const FONT_FAMILIES = ["Inter Variable", "Fraunces Variable", "JetBrains Mono Variable", "Space Grotesk Variable", "Bricolage Grotesque Variable", "Instrument Serif"];

type KitBase = Omit<Kit, "accent">;
const base = { titleSize: 76, bodySize: 32, citationSize: 20 };

export const KITS: Record<KitId, KitBase> = {
  // Dark, glowing, centred: the original look.
  midnight: {
    ...base,
    id: "midnight",
    mode: "dark",
    bg: "#070a14",
    fg: "#f8fafc",
    muted: "#a5b0c4",
    font: SANS,
    displayFont: SANS,
    titleWeight: 800,
    titleCase: "none",
    titleTracking: "-0.035em",
    align: "center",
    backdrop: "glow",
    fill: "gradient",
    headlineMotion: "fade-up",
    window: "mac-dark",
    radius: 14,
    caption: "dark-pill",
    chip: "pill",
    bar: "glow",
  },
  // Warm editorial: cream paper, serif headlines, left-aligned, ink-on-paper captions.
  paper: {
    ...base,
    id: "paper",
    mode: "light",
    bg: "#f5efe3",
    fg: "#1f1b16",
    muted: "#6b6255",
    font: SANS,
    displayFont: SERIF,
    titleSize: 80,
    titleWeight: 600,
    titleCase: "none",
    titleTracking: "-0.015em",
    align: "left",
    backdrop: "paper",
    fill: "solid",
    headlineMotion: "fade-up",
    window: "mac-light",
    radius: 12,
    caption: "light-card",
    chip: "tag",
    bar: "line",
  },
  // Developer tools: black, monospace, grid + scanlines, typewriter headlines, square terminal window.
  terminal: {
    ...base,
    id: "terminal",
    mode: "dark",
    bg: "#04060a",
    fg: "#e6edf3",
    muted: "#8b949e",
    font: MONO,
    displayFont: MONO,
    titleSize: 62,
    bodySize: 28,
    titleWeight: 700,
    titleCase: "none",
    titleTracking: "-0.02em",
    align: "left",
    backdrop: "grid",
    fill: "brand",
    headlineMotion: "typewriter",
    window: "terminal",
    radius: 4,
    caption: "mono-bar",
    chip: "mono",
    bar: "none",
  },
  // Loud and brand-led: full brand-colour field, heavy uppercase type, neo-brutalist window.
  poster: {
    ...base,
    id: "poster",
    mode: "dark",
    bg: "#111",
    fg: "#ffffff",
    muted: "rgba(255,255,255,0.82)",
    font: SANS,
    displayFont: BRICOLAGE,
    titleSize: 84,
    titleWeight: 800,
    titleCase: "uppercase",
    titleTracking: "-0.02em",
    align: "left",
    backdrop: "brand",
    fill: "solid",
    headlineMotion: "slam",
    window: "brutal",
    radius: 0,
    caption: "block",
    chip: "block",
    bar: "block",
  },
  // Consumer and creative: vivid moving colour field, frosted glass window and captions.
  aurora: {
    ...base,
    id: "aurora",
    mode: "dark",
    bg: "#0b0820",
    fg: "#ffffff",
    muted: "rgba(255,255,255,0.78)",
    font: SANS,
    displayFont: GROTESK,
    titleWeight: 700,
    titleCase: "none",
    titleTracking: "-0.03em",
    align: "center",
    backdrop: "aurora",
    fill: "solid",
    headlineMotion: "fade-up",
    window: "glass",
    radius: 22,
    caption: "glass",
    chip: "pill",
    bar: "none",
  },
  // Minimal Swiss: near-white, tight black sans, left-aligned, hairline accents.
  clean: {
    ...base,
    id: "clean",
    mode: "light",
    bg: "#fafafa",
    fg: "#0f0f10",
    muted: "#5d5f66",
    font: SANS,
    displayFont: SANS,
    titleSize: 78,
    titleWeight: 700,
    titleCase: "none",
    titleTracking: "-0.045em",
    align: "left",
    backdrop: "plain",
    fill: "solid",
    headlineMotion: "fade-up",
    window: "mac-light",
    radius: 10,
    caption: "light-card",
    chip: "tag",
    bar: "line",
  },
  // Cinematic: warm near-black, large light serif headlines, frosted window. Launch-film feel.
  studio: {
    ...base,
    id: "studio",
    mode: "dark",
    bg: "#0e0b09",
    fg: "#f6efe6",
    muted: "#b9aa98",
    font: SANS,
    displayFont: DISPLAY_SERIF,
    titleSize: 96,
    titleWeight: 400,
    titleCase: "none",
    titleTracking: "-0.01em",
    align: "left",
    backdrop: "glow",
    fill: "solid",
    headlineMotion: "fade-up",
    window: "glass",
    radius: 18,
    caption: "glass",
    chip: "tag",
    bar: "line",
  },
  // Technical but friendly: deep blue drafting grid, geometric grotesk, brand-coloured headlines.
  blueprint: {
    ...base,
    id: "blueprint",
    mode: "dark",
    bg: "#071426",
    fg: "#eaf2ff",
    muted: "#9db1cf",
    font: GROTESK,
    displayFont: GROTESK,
    titleSize: 74,
    titleWeight: 700,
    titleCase: "none",
    titleTracking: "-0.03em",
    align: "left",
    backdrop: "grid",
    fill: "brand",
    headlineMotion: "slam",
    window: "mac-dark",
    radius: 12,
    caption: "dark-pill",
    chip: "mono",
    bar: "glow",
  },
};

export const KIT_IDS = Object.keys(KITS) as KitId[];

/** Kit for a plan: the agent's choice when valid, else a stable pick from the seed. */
export function resolveKit(styleKit: string, seed: number, brand: string): Kit {
  const id = (KIT_IDS as string[]).includes(styleKit)
    ? (styleKit as KitId)
    : KIT_IDS[Math.abs(Math.trunc(seed)) % KIT_IDS.length];
  return { ...KITS[id], accent: brand };
}

/** Kept for code written before kits existed. */
export const DEFAULT_KIT: Kit = { ...KITS.midnight, accent: "#6366f1" };

/** "#2F80ED" → [hue 0-360, saturation 0-100, lightness 0-100]. Falls back to indigo on bad input. */
export function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [239, 84, 67];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

/** The brand hue at a chosen lightness, saturated enough to read as the brand. */
export function brandTint(hex: string, lightness = 78, alpha = 1) {
  const [h, s] = hexToHsl(hex);
  return `hsla(${h}, ${Math.min(95, Math.max(60, s))}%, ${lightness}%, ${alpha})`;
}

/** Brand accent that is readable on the kit's background (darker on light kits). */
export function accentOn(kit: Kit, alpha = 1) {
  return kit.mode === "light" ? brandTint(kit.accent, 40, alpha) : brandTint(kit.accent, 66, alpha);
}
