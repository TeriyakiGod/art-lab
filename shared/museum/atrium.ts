/**
 * The atrium is the one handcrafted room: a 24 × 24 m, 15 m tall hall with a water wall falling
 * the full height into a reflecting pool, a floating staircase up to a U-shaped balcony, and wings
 * opening off both levels. Everything here is in world meters; the generator, physics and renderer
 * all read these numbers so they always agree.
 */
import type { Side } from "./generate";

/** Height of one storey: upper-level floors sit this far above the ground. */
export const LEVEL_HEIGHT = 6;

export const ATRIUM = {
  rect: { x: -12, y: -12, w: 24, d: 24 },
  height: 15,
  /** Balconies run along the east, south and west walls at LEVEL_HEIGHT; the north wall is the water wall. */
  balconyDepth: 4,
  slab: 0.4,
  /** Doorways for wings, in cells from each side's low end. Two per side on the ground, two per balcony side upstairs. */
  ports: [
    ...(["N", "E", "S", "W"] as Side[]).flatMap((side) => [4, 17].map((start) => ({ side, start, level: 0 }))),
    ...(["E", "S", "W"] as Side[]).flatMap((side) => [4, 17].map((start) => ({ side, start, level: 1 }))),
  ],
  /** Hero walls: the stretch between each side's two ports. Ground ones sit under the balconies. */
  heroes: [
    { side: "E" as Side, level: 0, maxTop: 5.3, maxView: 6 },
    { side: "W" as Side, level: 0, maxTop: 5.3, maxView: 6 },
    { side: "E" as Side, level: 1, maxTop: 8.6, maxView: 3.3 },
    { side: "S" as Side, level: 1, maxTop: 8.6, maxView: 3.3 },
    { side: "W" as Side, level: 1, maxTop: 8.6, maxView: 3.3 },
  ],
  pool: { x0: -4.5, x1: 4.5, z0: -11.9, z1: -5, rim: 0.45, water: 0.36 },
  waterWall: { x0: -4, x1: 4, z: -12, top: 14.2 },
  /** Rises from z0 at the ground to z1 at the south balcony's edge. */
  stair: { x0: -1.6, x1: 1.6, z0: -1, z1: 8, steps: 30 },
  trees: [
    { x: -5.8, z: 2.5, height: 9.5, planter: 1.3 },
    { x: 5.8, z: 2.5, height: 9, planter: 1.3 },
  ],
  spawn: { x: 0, z: -2.4, yaw: 0 },
} as const;

/** Balcony floor rectangles (x0, x1, z0, z1), at LEVEL_HEIGHT. */
export function balconies() {
  const { x, y, w, d } = ATRIUM.rect;
  const b = ATRIUM.balconyDepth;
  return [
    { x0: x + w - b, x1: x + w, z0: y, z1: y + d }, // east
    { x0: x, x1: x + b, z0: y, z1: y + d }, // west
    { x0: x + b, x1: x + w - b, z0: y + d - b, z1: y + d }, // south
  ];
}

/** Glass railings along the balconies' inner edges, leaving a gap where the stair arrives. */
export function railings() {
  const { x, y, w, d } = ATRIUM.rect;
  const b = ATRIUM.balconyDepth;
  const inner = { x0: x + b, x1: x + w - b, zS: y + d - b };
  const s = ATRIUM.stair;
  return [
    { x1: inner.x1, z1: y, x2: inner.x1, z2: inner.zS }, // east edge
    { x1: inner.x0, z1: y, x2: inner.x0, z2: inner.zS }, // west edge
    { x1: inner.x0, z1: inner.zS, x2: s.x0, z2: inner.zS }, // south edge, west of the stair
    { x1: s.x1, z1: inner.zS, x2: inner.x1, z2: inner.zS }, // south edge, east of the stair
  ];
}

/** Whether (x, z) is on a balcony. */
export const onBalcony = (x: number, z: number) => balconies().some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

/** Whether (x, z) is on the atrium's ground floor and not in the pool. */
export function onAtriumGround(x: number, z: number) {
  const { x: rx, y: rz, w, d } = ATRIUM.rect;
  const p = ATRIUM.pool;
  const inside = x >= rx && x <= rx + w && z >= rz && z <= rz + d;
  return inside && !(x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
}
