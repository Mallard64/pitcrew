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
  bg: "#0b1020",
  fg: "#f8fafc",
  muted: "#94a3b8",
  accent: "#6366f1",
  font: "Inter, 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif",
  titleSize: 72,
  bodySize: 34,
  citationSize: 20,
};
