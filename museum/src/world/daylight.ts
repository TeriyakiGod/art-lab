import { Color } from "three";
import { uniform } from "three/tsl";

/**
 * The time of day, from the visitor's own clock: the skylight shows that sky, and the sun through
 * it follows. `?hour=22` overrides it (handy for trying the night).
 */
export function localHour() {
  const forced = Number(new URLSearchParams(location.search).get("hour"));
  if (Number.isFinite(forced) && new URLSearchParams(location.search).has("hour")) return ((forced % 24) + 24) % 24;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

/** Shared with the skylight shader. */
export const hourUniform = uniform(localHour());

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 at night, 1 in full day, easing through dawn (5–8) and dusk (18–21). */
export const dayAmount = (h: number) => smooth(5, 8, h) * (1 - smooth(18, 21, h));
/** Peaks around sunrise and sunset. */
export const goldenAmount = (h: number) => Math.max(0, 1 - Math.abs(h - 6.8) / 1.3) + Math.max(0, 1 - Math.abs(h - 19.2) / 1.3);

/** The sun (or moon) through the skylight: color and how strong. */
export function sunlight(h: number) {
  const day = dayAmount(h), gold = Math.min(1, goldenAmount(h));
  const color = new Color("#9fb4ff").lerp(new Color("#fff3e2"), day).lerp(new Color("#ffb070"), gold * 0.7);
  return { color, intensity: 260 + 2140 * day, sky: 0.55 + 0.45 * day };
}
