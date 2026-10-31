import { describe, expect, it } from "vitest";
import { generate, sideLength, type FloorPlan, type Rect } from "../../shared/museum/generate";
import { isWalkable, neighbors } from "../../shared/museum/floorplan";
import type { Exhibit } from "../../shared/museum/manifest";
import { rng } from "../../shared/museum/rng";

/** A random but reproducible collection: `n` works over `wings` wings, some heroes, mixed sizes. */
function collection(seed: string, n: number, wings: number): Exhibit[] {
  const r = rng(seed);
  const palettes = [["#0b0b10", "#ff2e88", "#00e5ff"], ["#f4f1ea", "#111111"], [], ["#1b1026", "#ff9f43"]];
  return Array.from({ length: n }, (_, i) => {
    const long = [0.8, 1.2, 1.2, 1.2, 2, 3][Math.floor(r() * 6)];
    const aspect = [1, 1, 0.75, 1.5, 0.6][Math.floor(r() * 5)];
    const size = aspect >= 1 ? { w: long, h: +(long / aspect).toFixed(3) } : { w: +(long * aspect).toFixed(3), h: long };
    return {
      id: `e${i}`, title: `Work ${i}`, statement: "", wing: `Wing ${Math.floor(r() * wings)}`, position: i,
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

      it("keeps rooms apart (only corridor ends touch)", () => {
        const rooms = full.rooms;
        for (let i = 0; i < rooms.length; i++) {
          for (let j = i + 1; j < rooms.length; j++) {
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
          expect(s.y + s.h / 2).toBeLessThan(full.rooms[s.room].height);
          expect(s.y - s.h / 2).toBeGreaterThan(0.3);
          // Someone standing in front of it can get there.
          expect(isWalkable(full, s.x + s.nx * 1.5, s.z + s.nz * 1.5)).toBe(true);
          for (const d of full.doors) {
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
            if (a.room !== b.room || a.nx !== b.nx || a.nz !== b.nz || Math.abs(a.nx ? a.x - b.x : a.z - b.z) > 0.01) continue;
            const gap = Math.abs(a.nx ? a.z - b.z : a.x - b.x) - (a.w + b.w) / 2;
            expect(gap, `${a.exhibitId} and ${b.exhibitId} overlap`).toBeGreaterThan(0.2);
          }
        }
      });

      it("keeps each wing's galleries in that wing", () => {
        const byId = new Map(works.map((w) => [w.id, w]));
        for (const s of full.slots) {
          const room = full.rooms[s.room];
          if (room.type === "atrium") expect(byId.get(s.exhibitId)!.hero).toBe(true);
          else expect(room.wing).toBe(byId.get(s.exhibitId)!.wing);
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
