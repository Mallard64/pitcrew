/** Minimal kit used until the style-kit system (C14) lands. */
export type Kit = {
  id: string;
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  font: string;
  titleSize: number;
  bodySize: number;
  citationSize: number;
};

export const DEFAULT_KIT: Kit = {
  id: "default",
  bg: "#070a14",
  fg: "#f8fafc",
  muted: "#a5b0c4",
  accent: "#6366f1",
  font: "Inter, 'SF Pro Display', -apple-system, 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif",
  titleSize: 76,
  bodySize: 32,
  citationSize: 20,
};

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

/** A light tint of the brand colour that stays readable on the dark backdrop. */
export function brandTint(hex: string, lightness = 78, alpha = 1) {
  const [h, s] = hexToHsl(hex);
  return `hsla(${h}, ${Math.min(95, Math.max(60, s))}%, ${lightness}%, ${alpha})`;
}
