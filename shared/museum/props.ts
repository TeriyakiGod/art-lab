import { ATRIUM, LEVEL_HEIGHT } from "./atrium";
import { floorY, type FloorPlan, type Room } from "./generate";
import { hash, rng, shuffle } from "./rng";

/**
 * Furniture and greenery: where every plant, tree, bench and strand of ivy goes. Deterministic like
 * the floor plan, and per room, so a room's props never change when other rooms appear. Benches sit
 * in a room's floor slots until a 3D work claims the slot (plan §9).
 */

export type PlantSpecies = "blades" | "arching" | "round";

export type Prop =
  | { kind: "plant"; species: PlantSpecies; x: number; y: number; z: number; scale: number; seed: number; r: number }
  | { kind: "tree"; x: number; y: number; z: number; height: number; planter: number; seed: number; r: number }
  | {
    kind: "bench"; x: number; y: number; z: number; /** Along the seat's length. */ yaw: number; length: number; style: 0 | 1; seed: number;
    /** Benches with a view face it (1: along +normal, −1: against it); others face the side you sit down from. */
    facing?: 1 | -1;
  }
  /** Strands hanging from a balcony edge, from (x1, z1) to (x2, z2) at height y. */
  | { kind: "ivy"; x1: number; z1: number; x2: number; z2: number; y: number; seed: number };

export const BENCH_DEPTH = 0.5;
export const SEAT_HEIGHT = 0.46;
const POT_INSET = 0.6;
const SPECIES: PlantSpecies[] = ["blades", "arching", "round"];

function galleryProps(room: Room, plan: FloorPlan, seed: string): Prop[] {
  const r = rng(seed, "props", room.id);
  const { x, y, w, d } = room.rect;
  const fy = floorY(room.level);
  const props: Prop[] = [];
  // Plants in two or three of the four corners, which art and doorways always leave free.
  const corners = shuffle([[x + POT_INSET, y + POT_INSET], [x + w - POT_INSET, y + POT_INSET], [x + POT_INSET, y + d - POT_INSET], [x + w - POT_INSET, y + d - POT_INSET]], r);
  const count = w * d >= 140 ? 3 : 2;
  for (const [px, pz] of corners.slice(0, count)) {
    const species = SPECIES[Math.floor(r() * SPECIES.length)];
    props.push({ kind: "plant", species, x: px, y: fy, z: pz, scale: 0.9 + r() * 0.5, seed: hash(seed, room.id, px, pz), r: 0.38 });
  }
  // A bench in each floor slot, its length along the room's longer side so sitters face the long walls.
  for (const s of plan.floorSlots.filter((s) => s.room === room.id)) {
    props.push({
      kind: "bench", x: s.x, y: fy, z: s.z, yaw: w >= d ? 0 : Math.PI / 2,
      length: s.r >= 1.5 ? 2.4 : 2, style: r() < 0.5 ? 0 : 1, seed: hash(seed, room.id, s.x, s.z),
    });
  }
  return props;
}

/** The atrium's props are placed by hand. */
function atriumProps(seed: string): Prop[] {
  const props: Prop[] = [];
  const h = (...p: (string | number)[]) => hash(seed, "atrium", ...p);
  for (const t of ATRIUM.trees) props.push({ kind: "tree", x: t.x, y: 0, z: t.z, height: t.height, planter: t.planter, seed: h("tree", t.x), r: t.planter + 0.1 });
  // Benches facing the water wall, and under the east and west balconies facing the hero walls.
  props.push({ kind: "bench", x: -2.6, y: 0, z: -3.9, yaw: 0, length: 2.6, style: 1, seed: h("b1"), facing: -1 });
  props.push({ kind: "bench", x: 2.6, y: 0, z: -3.9, yaw: 0, length: 2.6, style: 1, seed: h("b2"), facing: -1 });
  props.push({ kind: "bench", x: 9, y: 0, z: 0, yaw: Math.PI / 2, length: 3, style: 0, seed: h("b3"), facing: 1 });
  props.push({ kind: "bench", x: -9, y: 0, z: 0, yaw: Math.PI / 2, length: 3, style: 0, seed: h("b4"), facing: -1 });
  // Upstairs, by the south railing, looking out over the atrium to the water wall.
  props.push({ kind: "bench", x: -4.6, y: LEVEL_HEIGHT, z: 9.3, yaw: 0, length: 2.2, style: 0, seed: h("b5"), facing: -1 });
  props.push({ kind: "bench", x: 4.6, y: LEVEL_HEIGHT, z: 9.3, yaw: 0, length: 2.2, style: 0, seed: h("b6"), facing: -1 });
  // Potted plants in the ground corners and along the balconies.
  const pots: [number, number, number, PlantSpecies, number][] = [
    [-11.2, 0, 11.2, "arching", 1.5], [11.2, 0, 11.2, "arching", 1.5], [-11.2, 0, -11.2, "blades", 1.4], [11.2, 0, -11.2, "blades", 1.4],
    [-5.2, 0, -4.3, "round", 1.1], [5.2, 0, -4.3, "round", 1.1],
    [-11.2, LEVEL_HEIGHT, -11.2, "arching", 1.3], [11.2, LEVEL_HEIGHT, -11.2, "arching", 1.3],
    [-11.2, LEVEL_HEIGHT, 11.2, "round", 1.2], [11.2, LEVEL_HEIGHT, 11.2, "round", 1.2],
    [-10.9, LEVEL_HEIGHT, -2.2 - 7, "blades", 1.1], [10.9, LEVEL_HEIGHT, 9.4, "blades", 1.1],
  ];
  for (const [x, y, z, species, scale] of pots) props.push({ kind: "plant", species, x, y, z, scale, seed: h("pot", x, y, z), r: 0.38 * scale });
  // Ivy spilling over the balcony edges.
  const s = ATRIUM.stair;
  const edge = ATRIUM.rect.x + ATRIUM.balconyDepth;
  const south = ATRIUM.rect.y + ATRIUM.rect.d - ATRIUM.balconyDepth;
  for (const [x1, z1, x2, z2] of [
    [edge, -11.5, edge, -6], [edge, -3, edge, 6.5], [-edge, -11.5, -edge, -6], [-edge, -3, -edge, 6.5],
    [-edge + 0.5, south, s.x0 - 1.5, south], [s.x1 + 1.5, south, edge - 0.5, south],
  ]) props.push({ kind: "ivy", x1, z1, x2, z2, y: LEVEL_HEIGHT, seed: h("ivy", x1, z1) });
  return props;
}

export function propsFor(plan: FloorPlan, seed: string): Prop[] {
  return plan.rooms.flatMap((room) => (room.type === "atrium" ? atriumProps(seed) : room.type === "gallery" ? galleryProps(room, plan, seed) : []));
}

/** Seats people can sit on: each bench, with its center, direction and length. */
export const seatsOf = (props: Prop[]) => props.filter((p): p is Extract<Prop, { kind: "bench" }> => p.kind === "bench");
