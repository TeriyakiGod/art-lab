import { describe, expect, it } from "vitest";
import { generate, sameLevel, sideLength, wingOf, type FloorPlan, type Rect } from "../../shared/museum/generate";
import { ATRIUM } from "../../shared/museum/atrium";
import { isWalkable, neighbors, viewpoint } from "../../shared/museum/floorplan";
import type { Exhibit } from "../../shared/museum/manifest";
import { rng } from "../../shared/museum/rng";
import { propsFor, type Prop } from "../../shared/museum/props";

/** A random but reproducible collection: `n` works over `wings` wings, some heroes, mixed sizes. */
function collection(seed: string, n: number, wings: number): Exhibit[] {
  const r = rng(seed);
  const palettes = [["#0b0b10", "#ff2e88", "#00e5ff"], ["#f4f1ea", "#111111"], [], ["#1b1026", "#ff9f43"]];
  return Array.from({ length: n }, (_, i) => {
    const long = [0.8, 1.2, 1.2, 1.2, 2, 3][Math.floor(r() * 6)];
    const aspect = [1, 1, 0.75, 1.5, 0.6][Math.floor(r() * 5)];
    const size = aspect >= 1 ? { w: long, h: +(long / aspect).toFixed(3) } : { w: +(long * aspect).toFixed(3), h: long };
    return {
      // Collection 0 stands for "no collection": the main hall.
      id: `e${i}`, title: `Work ${i}`, statement: "", collection: ((n) => (n === 0 ? null : `c${n}`))(Math.floor(r() * wings)), position: i,
      hero: r() < 0.05, live: true, engine: "canvas", seed: String(i), palette: palettes[i % palettes.length],
      animated: false, createdAt: 1_700_000_000_000 + i, medium: "2d", size,
      images: { "1k": "", "2k": "" },
    } satisfies Exhibit;
  });
}

const plan = (exhibits: Exhibit[], layoutSeed = "test") => generate({ layoutSeed, exhibits });

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/** Rooms without which exits have been used (a later child may open one). */
const roomShapes = (p: FloorPlan) => p.rooms.map(({ exits, ...rest }) => ({ ...rest, exits: exits.length }));

const cases = [
  { seed: "a", n: 40, wings: 3 },
  { seed: "b", n: 120, wings: 6 },
  { seed: "c", n: 250, wings: 12 },
  { seed: "e", n: 300, wings: 16 },
  { seed: "d", n: 60, wings: 1 },
];

describe("generate", () => {
  it("is deterministic", () => {
    const works = collection("det", 80, 5);
    expect(plan(works)).toEqual(plan(works));
    expect(plan(works, "other seed")).not.toEqual(plan(works));
  });

  it("starts with just the atrium", () => {
    const p = plan([]);
    expect(p.rooms.map((r) => r.type)).toEqual(["atrium"]);
    expect(isWalkable(p, p.spawn.x, p.spawn.z)).toBe(true);
    // Nothing walkable in mid-air over the atrium floor; the balconies are.
    expect(isWalkable(p, 0, 0, 1)).toBe(false);
    expect(isWalkable(p, 10, 0, 1)).toBe(true);
  });

  for (const { seed, n, wings } of cases) {
    describe(`${n} works in ${wings} wings (${seed})`, () => {
      const works = collection(seed, n, wings);
      const full = plan(works);

      it("places every work", () => {
        expect(full.unplaced).toEqual([]);
        expect(full.slots.length).toBe(n);
      });

      it("never moves earlier rooms or works when one is added", () => {
        let prev = plan([]);
        for (let i = 1; i <= n; i++) {
          const next = plan(works.slice(0, i));
          expect(roomShapes(next).slice(0, prev.rooms.length)).toEqual(roomShapes(prev));
          expect(next.slots.slice(0, prev.slots.length)).toEqual(prev.slots);
          prev = next;
        }
      });

      it("keeps rooms on the same level apart (only corridor ends touch)", () => {
        const rooms = full.rooms;
        for (let i = 0; i < rooms.length; i++) {
          for (let j = i + 1; j < rooms.length; j++) {
            if (!sameLevel(rooms[i], rooms[j].level) && !sameLevel(rooms[j], rooms[i].level)) continue;
            expect(overlap(rooms[i].rect, rooms[j].rect), `rooms ${i} and ${j} overlap`).toBe(false);
          }
        }
      });

      it("connects every room to the atrium", () => {
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) for (const n of neighbors(full, queue.shift()!)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
        expect(seen.size).toBe(full.rooms.length);
      });

      it("hangs works inside their room, apart from each other and clear of doorways", () => {
        for (const s of full.slots) {
          const r = full.rooms[s.room].rect;
          expect(s.x).toBeGreaterThanOrEqual(r.x);
          expect(s.x).toBeLessThanOrEqual(r.x + r.w);
          expect(s.z).toBeGreaterThanOrEqual(r.y);
          expect(s.z).toBeLessThanOrEqual(r.y + r.d);
          const floor = s.level * 6;
          expect(s.y + s.h / 2).toBeLessThan(floor + full.rooms[s.room].height);
          expect(s.y - s.h / 2).toBeGreaterThan(floor + 0.3);
          // Someone standing at its viewpoint (and close up) can get there.
          const v = viewpoint(s);
          expect(isWalkable(full, v.x, v.z, s.level), `viewpoint of ${s.exhibitId}`).toBe(true);
          expect(isWalkable(full, s.x + s.nx * 1.2, s.z + s.nz * 1.2, s.level)).toBe(true);
          for (const d of full.doors) {
            if (d.y !== floor) continue;
            // The work's span along its wall must not reach into a doorway on the same wall line.
            const onLine = s.nx !== 0 ? d.x1 === d.x2 && Math.abs(d.x1 - s.x) < 0.5 : d.z1 === d.z2 && Math.abs(d.z1 - s.z) < 0.5;
            if (!onLine) continue;
            const [lo, hi] = s.nx !== 0 ? [Math.min(d.z1, d.z2), Math.max(d.z1, d.z2)] : [Math.min(d.x1, d.x2), Math.max(d.x1, d.x2)];
            const c = s.nx !== 0 ? s.z : s.x;
            expect(c + s.w / 2 <= lo || c - s.w / 2 >= hi, `work ${s.exhibitId} covers a doorway`).toBe(true);
          }
        }
        for (let i = 0; i < full.slots.length; i++) {
          for (let j = i + 1; j < full.slots.length; j++) {
            const a = full.slots[i], b = full.slots[j];
            if (a.room !== b.room || a.level !== b.level || a.nx !== b.nx || a.nz !== b.nz || Math.abs(a.nx ? a.x - b.x : a.z - b.z) > 0.01) continue;
            const gap = Math.abs(a.nx ? a.z - b.z : a.x - b.x) - (a.w + b.w) / 2;
            expect(gap, `${a.exhibitId} and ${b.exhibitId} overlap`).toBeGreaterThan(0.2);
          }
        }
      });

      it("keeps each wing on one level", () => {
        const levels = new Map<string, Set<number>>();
        for (const r of full.rooms) if (r.wing) levels.set(r.wing, (levels.get(r.wing) ?? new Set()).add(r.level));
        for (const [wing, set] of levels) expect(set.size, wing).toBe(1);
        // Every room is upstairs; the ground floor stays free.
        for (const r of full.rooms) if (r.type !== "atrium") expect(r.level, `room ${r.id}`).toBe(1);
      });

      it("keeps each wing's galleries in that wing", () => {
        const byId = new Map(works.map((w) => [w.id, w]));
        for (const s of full.slots) {
          const room = full.rooms[s.room];
          if (room.type === "atrium") expect(byId.get(s.exhibitId)!.hero).toBe(true);
          else expect(room.wing).toBe(wingOf(byId.get(s.exhibitId)!));
        }
      });

      it("gives every gallery side room for its exits and doors", () => {
        for (const room of full.rooms.filter((r) => r.type === "gallery")) {
          for (const o of room.exits) expect(o.start + o.width).toBeLessThanOrEqual(sideLength(room.rect, o.side));
        }
      });
    });
  }
});

describe("collections", () => {
  const works = collection("halls", 120, 6);
  const themed = generate({ layoutSeed: "test", exhibits: works, collections: [{ id: "c1", name: "One", color: "#ff0000" }] });

  it("hangs works without a collection in the main hall, through the doorway at the top of the stair", () => {
    const hall = themed.rooms.find((r) => r.type === "gallery" && r.wing === "main")!;
    expect(hall).toBeDefined();
    const corridor = themed.rooms[hall.parent!];
    expect(corridor.parent).toBe(0);
    // The corridor leaves the atrium's south wall, centered on the 4 m main port.
    const { x, y, d } = ATRIUM.rect;
    expect(corridor.rect.y).toBe(y + d);
    expect(corridor.rect.x).toBe(x + ATRIUM.mainPort.start);
    expect(corridor.rect.w).toBe(ATRIUM.mainPort.width);
    expect(hall.level).toBe(1);
    expect(hall.height).toBeGreaterThan(5);
  });

  it("never gives the main hall's doorway to a collection", () => {
    for (const r of themed.rooms.filter((r) => r.type === "corridor" && r.parent === 0 && r.wing !== "main")) {
      expect(r.rect.w === ATRIUM.mainPort.width && r.rect.x === ATRIUM.rect.x + ATRIUM.mainPort.start).toBe(false);
    }
  });

  it("themes a collection's rooms with its color", () => {
    const rooms = themed.rooms.filter((r) => r.wing === "c1");
    expect(rooms.length).toBeGreaterThan(0);
    for (const r of rooms) expect(r.accent).toBe("#ff0000");
  });
});

describe("props", () => {
  const works = collection("props", 150, 10);
  const p = plan(works);
  const props = propsFor(p, "test");

  /** Footprint check: is (x, z) on `level` inside this prop? */
  const blocks = (prop: Prop, x: number, z: number, level: number) => {
    if (prop.kind === "ivy") return false;
    if (Math.round(prop.y / 6) !== level) return false;
    if (prop.kind === "bench") {
      const c = Math.cos(prop.yaw), s = Math.sin(prop.yaw);
      const dx = x - prop.x, dz = z - prop.z;
      const along = dx * c - dz * s, across = dx * s + dz * c;
      return Math.abs(along) < prop.length / 2 + 0.3 && Math.abs(across) < 0.25 + 0.3;
    }
    return Math.hypot(x - prop.x, z - prop.z) < prop.r + 0.3;
  };

  it("is deterministic and furnishes every gallery", () => {
    expect(propsFor(p, "test")).toEqual(props);
    for (const room of p.rooms.filter((r) => r.type === "gallery")) {
      expect(props.some((q) => q.kind === "plant" && q.x > room.rect.x && q.x < room.rect.x + room.rect.w && q.z > room.rect.y && q.z < room.rect.y + room.rect.d)).toBe(true);
    }
  });

  it("never blocks a doorway or the spot in front of a work", () => {
    for (const prop of props) {
      for (const s of p.slots) {
        const v = viewpoint(s);
        expect(blocks(prop, v.x, v.z, s.level), `${prop.kind} blocks the view of ${s.exhibitId}`).toBe(false);
        expect(blocks(prop, s.x + s.nx * 0.9, s.z + s.nz * 0.9, s.level), `${prop.kind} stands in front of ${s.exhibitId}`).toBe(false);
      }
      for (const d of p.doors) {
        const level = Math.round(d.y / 6);
        const mx = (d.x1 + d.x2) / 2, mz = (d.z1 + d.z2) / 2;
        for (const [ox, oz] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
          expect(blocks(prop, mx + ox, mz + oz, level), `${prop.kind} blocks a doorway`).toBe(false);
        }
      }
    }
  });

  it("puts a tree in the middle of every gallery, clear of every other prop", () => {
    for (const room of p.rooms.filter((r) => r.type === "gallery")) {
      const cx = room.rect.x + room.rect.w / 2, cz = room.rect.y + room.rect.d / 2;
      const tree = props.find((q) => q.kind === "tree" && q.x === cx && q.z === cz);
      expect(tree, `tree in room ${room.id}`).toBeDefined();
      for (const q of props.filter((q) => q.room === room.id && q !== tree)) {
        const edges = q.kind === "bench" ? [-1, 0, 1].map((t) => [q.x + Math.cos(q.yaw) * t * q.length / 2, q.z - Math.sin(q.yaw) * t * q.length / 2]) : [[q.x, q.z]];
        for (const [x, z] of edges) expect(Math.hypot(x - cx, z - cz), `${q.kind} against the tree`).toBeGreaterThan(tree!.r);
      }
    }
  });

  it("puts every prop somewhere walkable", () => {
    for (const prop of props) {
      if (prop.kind === "ivy") continue;
      expect(isWalkable(p, prop.x, prop.z, Math.round(prop.y / 6)), `${prop.kind} at ${prop.x},${prop.y},${prop.z}`).toBe(true);
    }
  });
});
