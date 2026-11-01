/**
 * What a visitor can do besides moving, whichever device they use: keys, taps and gamepad buttons
 * all end up here. The overlay registers the handlers (it knows the exhibits and the plan).
 */
export type Action = "interact" | "back" | "reroll" | "original" | "next" | "previous" | "map" | "copy" | "pause";

let handler: ((a: Action) => void) | null = null;
export const onAction = (h: ((a: Action) => void) | null) => void (handler = h);
export const act = (a: Action) => handler?.(a);

/** Picks what's under a point on screen (normalized device coordinates); set by the Player. */
type Pick = { exhibit?: string; seat?: number };
let picker: ((x: number, y: number) => Pick) | null = null;
export const setPicker = (p: typeof picker) => void (picker = p);
export const pickAt = (x: number, y: number): Pick => picker?.(x, y) ?? {};

/** Moves the visitor; consumed by the Player on its next physics step. */
export type Teleport = { x: number; y: number; z: number; yaw: number; pitch?: number };
let pending: Teleport | null = null;
export const requestTeleport = (t: Teleport) => void (pending = t);
export const takeTeleport = () => {
  const t = pending;
  pending = null;
  return t;
};
