import type { UiDesign } from "@/appearance/preference";

const PALETTES = {
  current: { bgPanel: "#181b19", bgRaised: "#222722", border: "#333a33", borderStrong: "#51594d",
    fg: "#f6f2e9", fgMuted: "#b8bcaf", fgFaint: "#a4aa9b", accent: "#cfaf7d",
    pos: "#2ecc8f", neg: "#f0525f", warn: "#e8b339", sma50: "#cfaf7d", sma200: "#e8b339", volume: "#51594d" },
  workspace: { bgPanel: "#ffffff", bgRaised: "#f0ebe1", border: "#d5cbbb", borderStrong: "#918571",
    fg: "#181b19", fgMuted: "#665b4c", fgFaint: "#665b4c", accent: "#785b32",
    pos: "#17624b", neg: "#a23642", warn: "#896000", sma50: "#785b32", sma200: "#896000", volume: "#918571" },
} as const;

export type ChartPalette = { [Key in keyof typeof PALETTES.current]: string };
/** Canvas charts require resolved colors, whereas SVG can inherit CSS tokens. */
export function chartPalette(design: UiDesign = "current"): ChartPalette { return PALETTES[design]; }

export const SVG_CHART_THEME = {
  bgRaised: "var(--bg-raised)", border: "var(--border)", borderStrong: "var(--border-strong)",
  fg: "var(--fg)", fgMuted: "var(--fg-muted)", fgFaint: "var(--fg-faint)",
  accent: "var(--accent)", pos: "var(--pos)", neg: "var(--neg)", warn: "var(--warn)",
} as const;
