import type { Palette } from "./types";

/**
 * The active palette lives in a sketch's param values under this key, so it
 * travels with outputs, variations and exports like any other param.
 * Sketches read it with `lab.palette()`.
 */
export const PALETTE_KEY = "$palette";

export const MAX_PALETTE_COLORS = 12;
export const isHexColor = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

const starter = (id: string, name: string, colors: string[]): Palette => ({ id: `starter:${id}`, name, colors, createdAt: 0, updatedAt: 0 });

/** Built-in palettes; the first color is usually a good background. */
export const STARTER_PALETTES: Palette[] = [
  starter("paper-ink", "Paper & ink", ["#f1ece2", "#1d1b22", "#e4572e", "#29335c", "#f3a712"]),
  starter("sunset", "Sunset", ["#1b1026", "#ff9f43", "#ee5253", "#f8efe0", "#feca57"]),
  starter("sea", "Sea", ["#06222e", "#c8f7f4", "#1dd1a1", "#10ac84", "#48dbfb"]),
  starter("forest", "Forest", ["#f2efe6", "#2d4a3e", "#6b8f71", "#c9a227", "#8c3b2e"]),
  starter("bauhaus", "Bauhaus", ["#f4f1ea", "#111111", "#d7263d", "#1b4f9c", "#f2c14e"]),
  starter("neon", "Neon night", ["#0b0b10", "#ff2e88", "#00e5ff", "#c6ff00", "#7c4dff"]),
  starter("mono", "Mono", ["#f4f1ea", "#111111", "#555555", "#999999", "#cccccc"]),
];
