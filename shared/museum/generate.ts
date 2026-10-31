import { GENERATOR_VERSION, type Exhibit, type Manifest } from "./manifest";
import { rng, shuffle, type Rng } from "./rng";

/*
 * The museum's floor-plan generator: a pure function from the manifest to a building.
 * See docs/museum-plan.md §5.
 *
 * Grid: cell (x, y) covers world [x, x+1] × [y, y+1] on the X/Z plane (grid y is world z).
 * North is −z. Rooms are rectangles of cells that never touch, except a corridor touching the
 * rooms at its two ends, so every wall belongs to exactly one room.
 *
 * Stability: works are placed one at a time in `position` order (one sequence across all wings),
 * and each decision only looks at what was placed before it. So adding a work never moves an
 * existing room or work. Every random choice comes from rng(layoutSeed, wing, roomIndex), never
 * from one shared stream.
 */

export type Side = "N" | "E" | "S" | "W";
export type Rect = { x: number; y: number; w: number; d: number };
export type RoomType = "atrium" | "gallery" | "corridor";

/** A gap in one side of a room, in cells from the side's low end (x for N/S, y for E/W). */
export type Opening = { side: Side; start: number; width: number };

export type Room = {
  id: number;
  type: RoomType;
  /** null for the atrium. */
  wing: string | null;
  rect: Rect;
  height: number;
  /** Hex color the room's lights and details take on. */
  accent: string;
  parent: number | null;
  /** The opening toward the parent room; always open. */
  entrance: Opening | null;
  /**
   * Openings reserved for child rooms, in the order children use them. Art is never hung there,
   * so a doorway can open later without covering anything. Unused ones stay blank wall.
   */
  exits: Opening[];
};

/** World-space segment of an open doorway between two rooms. */
export type Door = { from: number; to: number; x1: number; z1: number; x2: number; z2: number };

/** A wall piece on a room's boundary, from y0 up to y1 (lintels above doorways start above 0). */
export type Wall = { room: number; x1: number; z1: number; x2: number; z2: number; y0: number; y1: number };

/** A 2D work on a wall. x/y/z is the center of the work's face; (nx, nz) points into the room. */
export type WallSlot = {
  exhibitId: string; room: number;
  x: number; y: number; z: number; nx: number; nz: number;
  w: number; h: number;
};

/** A spot reserved on the floor for a future 3D work (plan §9). Empty for now. */
export type FloorSlot = { room: number; x: number; z: number; r: number };

export type FloorPlan = {
  generatorVersion: number;
  rooms: Room[];
  doors: Door[];
  walls: Wall[];
  slots: WallSlot[];
  floorSlots: FloorSlot[];
  /** Works that found no place (should never happen; the tests check). */
  unplaced: string[];
  spawn: { x: number; z: number; yaw: number };
};

// ---- dimensions (meters = cells) ----
export const DOOR_WIDTH = 3;
export const DOOR_HEIGHT = 3.2;
export const WALL_THICKNESS = 0.2;
export const EYE_HEIGHT = 1.65;
const ATRIUM = { size: 16, height: 9, ports: [2, 11] };
const GALLERY_HEIGHT = 4.6;
const CORRIDOR_HEIGHT = DOOR_HEIGHT;
const GALLERY_SIZES: [number, number][] = [[12, 10], [10, 12], [14, 9], [9, 14], [11, 11], [16, 10], [8, 12], [12, 8], [13, 13]];
const CORRIDOR_LENGTHS = [2, 3, 4, 5];
const FALLBACK_CORRIDOR_LENGTHS = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16];
/** Distance from a wall's line to the face of a work hung on it. */
const ART_INSET = WALL_THICKNESS / 2 + 0.04;
/** Art keeps this far from corners and doorways. */
const CORNER_MARGIN = 0.6;
const OPENING_MARGIN = 0.5;
/** Walls are split into slots about this wide; wider works take several. */
const SLOT_PITCH = 2.6;
/** Minimum free space beside a work, split over both sides. */
const ART_GAP = 0.8;
const ART_CENTER = 1.55;

const SIDES: Side[] = ["N", "E", "S", "W"];
const OPPOSITE: Record<Side, Side> = { N: "S", S: "N", E: "W", W: "E" };

export const sideLength = (r: Rect, side: Side) => (side === "N" || side === "S" ? r.w : r.d);

/** The world-space line of one side, from its low end to its high end, with the inward normal. */
export function sideLine(r: Rect, side: Side) {
  switch (side) {
    case "N": return { x: r.x, z: r.y, dx: 1, dz: 0, nx: 0, nz: 1 };
    case "S": return { x: r.x, z: r.y + r.d, dx: 1, dz: 0, nx: 0, nz: -1 };
    case "W": return { x: r.x, z: r.y, dx: 0, dz: 1, nx: 1, nz: 0 };
    case "E": return { x: r.x + r.w, z: r.y, dx: 0, dz: 1, nx: -1, nz: 0 };
  }
}

const overlaps = (a: Rect, b: Rect, margin: number) =>
  a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.d + margin && b.y < a.y + a.d + margin;

/** Most saturated, not-too-dark color in a palette, for a room's accent. */
function accentFrom(palette: string[], fallback: Rng): string {
  let best: string | null = null;
  let bestScore = 0.15;
  for (const hex of palette) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const score = (max - min) * (max > 0.25 ? 1 : 0.3);
    if (score > bestScore) { bestScore = score; best = hex; }
  }
  if (best) return best;
  const hue = Math.floor(fallback() * 360);
  return hslHex(hue, 0.7, 0.6);
}

function hslHex(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Free intervals along each side where art may hang, in hanging order. */
type Run = { side: Side; a: number; b: number; pitch: number; taken: boolean[] };

function runsFor(room: Room): Run[] {
  if (room.type === "corridor") return [];
  if (room.type === "atrium") {
    // Only the wall between each side's two ports, one hero centered there.
    const [p1, p2] = ATRIUM.ports;
    const a = p1 + DOOR_WIDTH + OPENING_MARGIN, b = p2 - OPENING_MARGIN;
    return SIDES.map((side) => ({ side, a, b, pitch: b - a, taken: [false] }));
  }
  const first = room.entrance ? OPPOSITE[room.entrance.side] : "N";
  const order = SIDES.slice(SIDES.indexOf(first)).concat(SIDES.slice(0, SIDES.indexOf(first)));
  const runs: Run[] = [];
  for (const side of order) {
    const len = sideLength(room.rect, side);
    const blocked = [room.entrance, ...room.exits]
      .filter((o): o is Opening => !!o && o.side === side)
      .map((o) => [o.start - OPENING_MARGIN, o.start + o.width + OPENING_MARGIN])
      .sort((p, q) => p[0] - q[0]);
    let cursor = CORNER_MARGIN;
    for (const [s, e] of [...blocked, [len - CORNER_MARGIN, Infinity]]) {
      const a = cursor, b = Math.min(s, len - CORNER_MARGIN);
      const n = Math.floor((b - a) / SLOT_PITCH);
      if (n >= 1) runs.push({ side, a, b, pitch: (b - a) / n, taken: new Array(n).fill(false) });
      cursor = Math.max(cursor, e);
    }
  }
  return runs;
}

/** Hangs a work in the first free stretch of slots wide enough, or returns null. */
function hang(room: Room, runs: Run[], e: Exhibit): WallSlot | null {
  const { w, h } = e.size;
  const y = Math.max(room.type === "atrium" ? 2.4 : ART_CENTER, h / 2 + 0.45);
  if (y + h / 2 > room.height - 0.4) return null;
  for (const run of runs) {
    const k = Math.max(1, Math.ceil((w + ART_GAP) / run.pitch));
    if (k * run.pitch < w + 0.3) continue;
    for (let i = 0; i + k <= run.taken.length; i++) {
      if (run.taken.slice(i, i + k).some(Boolean)) continue;
      for (let j = i; j < i + k; j++) run.taken[j] = true;
      const along = run.a + run.pitch * (i + k / 2);
      const L = sideLine(room.rect, run.side);
      return {
        exhibitId: e.id, room: room.id, w, h, y,
        x: L.x + L.dx * along + L.nx * ART_INSET,
        z: L.z + L.dz * along + L.nz * ART_INSET,
        nx: L.nx, nz: L.nz,
      };
    }
  }
  return null;
}

/** The corridor rect that leaves `parent` through `exit`, `length` cells long. */
function corridorRect(parent: Rect, exit: Opening, length: number): Rect {
  const { x, y, w, d } = parent;
  switch (exit.side) {
    case "N": return { x: x + exit.start, y: y - length, w: exit.width, d: length };
    case "S": return { x: x + exit.start, y: y + d, w: exit.width, d: length };
    case "W": return { x: x - length, y: y + exit.start, w: length, d: exit.width };
    case "E": return { x: x + w, y: y + exit.start, w: length, d: exit.width };
  }
}

/** A room beyond the corridor's far end. `along`/`depth` are relative to the corridor's direction. */
function roomBeyond(c: Rect, dir: Side, along: number, depth: number, offset: number): Rect {
  switch (dir) {
    case "N": return { x: c.x - offset, y: c.y - depth, w: along, d: depth };
    case "S": return { x: c.x - offset, y: c.y + c.d, w: along, d: depth };
    case "W": return { x: c.x - depth, y: c.y - offset, w: depth, d: along };
    case "E": return { x: c.x + c.w, y: c.y - offset, w: depth, d: along };
  }
}

/** Exits centered on every side but the entrance, in a seeded order. */
function galleryExits(rect: Rect, entrance: Side, r: Rng): Opening[] {
  const exits = SIDES.filter((s) => s !== entrance).map((side) => ({
    side, start: Math.floor((sideLength(rect, side) - DOOR_WIDTH) / 2), width: DOOR_WIDTH,
  }));
  return shuffle(exits, r);
}

function floorSlotsFor(room: Room): FloorSlot[] {
  if (room.type !== "gallery") return [];
  const { x, y, w, d } = room.rect;
  const cx = x + w / 2, cz = y + d / 2;
  if (w >= 14 && d >= 9) return [{ room: room.id, x: cx - 3.5, z: cz, r: 1.4 }, { room: room.id, x: cx + 3.5, z: cz, r: 1.4 }];
  if (d >= 14 && w >= 9) return [{ room: room.id, x: cx, z: cz - 3.5, r: 1.4 }, { room: room.id, x: cx, z: cz + 3.5, r: 1.4 }];
  if (w >= 10 && d >= 10) return [{ room: room.id, x: cx, z: cz, r: 1.5 }];
  return [];
}

/** Sorts works into placement order: one sequence across all wings. */
export const placementOrder = (exhibits: Exhibit[]) =>
  [...exhibits].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));

export function generate(manifest: Pick<Manifest, "layoutSeed" | "exhibits">): FloorPlan {
  const seed = manifest.layoutSeed;
  const rooms: Room[] = [];
  const doors: Door[] = [];
  const slots: WallSlot[] = [];
  const unplaced: string[] = [];
  const runs = new Map<number, Run[]>();
  /** Exits already used by a child, per room. */
  const usedExits = new Map<number, Set<number>>();
  const wingRooms = new Map<string, number[]>();

  const addRoom = (room: Omit<Room, "id">) => {
    const r = { ...room, id: rooms.length };
    rooms.push(r);
    runs.set(r.id, runsFor(r));
    usedExits.set(r.id, new Set());
    return r;
  };

  const s = ATRIUM.size;
  const atriumRng = rng(seed, "atrium");
  const atrium = addRoom({
    type: "atrium", wing: null, rect: { x: -s / 2, y: -s / 2, w: s, d: s }, height: ATRIUM.height,
    accent: "#e8e6f0", parent: null, entrance: null,
    // Ports for wings, in the order wings claim them.
    exits: shuffle(SIDES.flatMap((side) => ATRIUM.ports.map((start) => ({ side, start, width: DOOR_WIDTH }))), atriumRng),
  });
  // Heroes hang on the atrium's sides in a seeded order.
  const atriumRuns = runs.get(atrium.id)!;
  const heroOrder = shuffle(atriumRuns, atriumRng);
  runs.set(atrium.id, heroOrder);

  const fits = (rect: Rect, ignore: number[]) =>
    rooms.every((r) => ignore.includes(r.id) || !overlaps(rect, r.rect, 1));

  /**
   * Tries to grow a corridor and a new gallery off `parent` through one of its free exits. The
   * gallery must have room on its walls for `e`, the work that needs it.
   */
  const grow = (parent: Room, e: Exhibit, r: Rng, lengths: number[], accent: string): Room | null => {
    const wing = e.wing;
    const used = usedExits.get(parent.id)!;
    const lens = shuffle(lengths.slice(0, 4), r).concat(lengths.slice(4));
    const sizes = shuffle(GALLERY_SIZES, r);
    for (let ei = 0; ei < parent.exits.length; ei++) {
      if (used.has(ei)) continue;
      const exit = parent.exits[ei];
      for (const len of lens) {
        const corridor = corridorRect(parent.rect, exit, len);
        if (!fits(corridor, [parent.id])) continue;
        for (const [along, depth] of sizes) {
          const centered = Math.floor((along - DOOR_WIDTH) / 2);
          for (const offset of [centered, 2, along - DOOR_WIDTH - 2]) {
            const rect = roomBeyond(corridor, exit.side, along, depth, offset);
            if (!fits(rect, [])) continue;
            const entranceSide = OPPOSITE[exit.side];
            const entrance = { side: entranceSide, start: offset, width: DOOR_WIDTH };
            const exits = galleryExits(rect, entranceSide, rng(seed, wing, parent.id, ei, along, depth, offset));
            const draft = { id: -1, type: "gallery", wing, rect, height: GALLERY_HEIGHT, accent, parent: -1, entrance, exits } satisfies Room;
            if (!hang(draft, runsFor(draft), e)) continue;
            used.add(ei);
            const c = addRoom({
              type: "corridor", wing, rect: corridor, height: CORRIDOR_HEIGHT, accent, parent: parent.id,
              entrance: { side: entranceSide, start: 0, width: DOOR_WIDTH },
              exits: [{ side: exit.side, start: 0, width: DOOR_WIDTH }],
            });
            usedExits.get(c.id)!.add(0);
            const room = addRoom({
              type: "gallery", wing, rect, height: GALLERY_HEIGHT, accent, parent: c.id,
              entrance, exits,
            });
            doors.push(doorBetween(parent, exit, c.id), doorBetween(c, c.exits[0], room.id));
            return room;
          }
        }
      }
    }
    return null;
  };

  for (const e of placementOrder(manifest.exhibits)) {
    if (e.hero) {
      const slot = hang(atrium, heroOrder, e);
      if (slot) { slots.push(slot); continue; }
    }
    const list = wingRooms.get(e.wing) ?? [];
    const current = list.length ? rooms[list[list.length - 1]] : null;
    const slot = current && hang(current, runs.get(current.id)!, e);
    if (slot) { slots.push(slot); continue; }

    // A new room for this wing: off its own rooms (newest first), or the atrium for a new wing;
    // as a last resort off any room with longer corridors.
    const r = rng(seed, e.wing, list.length);
    const accent = accentFrom(e.palette, r);
    const parents = list.length ? [...list].reverse().map((id) => rooms[id]) : [atrium];
    let room: Room | null = null;
    for (const p of parents) if ((room = grow(p, e, r, CORRIDOR_LENGTHS, accent))) break;
    if (!room) for (const p of rooms) if (p.type !== "corridor" && (room = grow(p, e, r, FALLBACK_CORRIDOR_LENGTHS, accent))) break;
    if (!room) { unplaced.push(e.id); continue; }
    list.push(room.id);
    wingRooms.set(e.wing, list);
    const placed = hang(room, runs.get(room.id)!, e);
    if (placed) slots.push(placed);
    else unplaced.push(e.id);
  }

  return {
    generatorVersion: GENERATOR_VERSION,
    rooms, doors, slots, unplaced,
    walls: rooms.flatMap((room) => wallsFor(room, usedExits.get(room.id)!)),
    floorSlots: rooms.flatMap(floorSlotsFor),
    spawn: { x: 0, z: 2, yaw: 0 },
  };
}

function doorBetween(from: Room, o: Opening, to: number): Door {
  const L = sideLine(from.rect, o.side);
  return {
    from: from.id, to,
    x1: L.x + L.dx * o.start, z1: L.z + L.dz * o.start,
    x2: L.x + L.dx * (o.start + o.width), z2: L.z + L.dz * (o.start + o.width),
  };
}

/** A room's walls: every side minus its open doorways, plus lintels above doorways in taller rooms. */
function wallsFor(room: Room, used: Set<number>): Wall[] {
  const open = [room.entrance, ...room.exits.filter((_, i) => used.has(i))].filter((o): o is Opening => !!o);
  const walls: Wall[] = [];
  for (const side of SIDES) {
    const L = sideLine(room.rect, side);
    const len = sideLength(room.rect, side);
    const at = (a: number, b: number, y0: number): Wall => ({
      room: room.id, y0, y1: room.height,
      x1: L.x + L.dx * a, z1: L.z + L.dz * a, x2: L.x + L.dx * b, z2: L.z + L.dz * b,
    });
    let cursor = 0;
    for (const o of open.filter((o) => o.side === side).sort((p, q) => p.start - q.start)) {
      if (o.start > cursor) walls.push(at(cursor, o.start, 0));
      if (room.height > DOOR_HEIGHT + 0.01) walls.push(at(o.start, o.start + o.width, DOOR_HEIGHT));
      cursor = o.start + o.width;
    }
    if (cursor < len) walls.push(at(cursor, len, 0));
  }
  return walls;
}
