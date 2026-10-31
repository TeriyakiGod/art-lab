import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from "three";
import { rng, type Rng } from "../../../shared/museum/rng";
import type { PlantSpecies } from "../../../shared/museum/props";

/**
 * Plants grown in code from a seed, so no two are alike and nothing has to be downloaded.
 * Everything is built in world space into a few shared buffers (leaves, bark, pots), so all the
 * museum's greenery draws in three draw calls. `sway` (0 at the base, 1 at the tips) drives the
 * wind in the leaf material.
 */
export class MeshBuilder {
  positions: number[] = [];
  colors: number[] = [];
  sway: number[] = [];

  /** One triangle, double-sided by the material. */
  tri(a: Vector3, b: Vector3, c: Vector3, ca: Color, cb: Color, cc: Color, sa = 0, sb = 0, sc = 0) {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    this.sway.push(sa, sb, sc);
  }

  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, col: Color, s = 0) {
    this.tri(a, b, c, col, col, col, s, s, s);
    this.tri(a, c, d, col, col, col, s, s, s);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    g.setAttribute("sway", new Float32BufferAttribute(this.sway, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const UP = new Vector3(0, 1, 0);
const tmp = () => new Vector3();
const lerpColor = (a: Color, b: Color, t: number) => a.clone().lerp(b, t);
const jitter = (c: Color, r: Rng, amount: number) => c.clone().offsetHSL((r() - 0.5) * amount * 0.1, (r() - 0.5) * amount * 0.2, (r() - 0.5) * amount * 0.15);

/**
 * A leaf as a strip of quads along `path`, `width(t)` wide, with a lighter midrib.
 * Three vertices across, so the edges and the middle can differ in color.
 */
function leafStrip(
  b: MeshBuilder, path: (t: number) => Vector3, width: (t: number) => number, sideOf: (t: number) => Vector3,
  base: Color, tip: Color, edge: Color, swayAt: (p: Vector3, t: number) => number, segments = 8,
) {
  let prev: Vector3[] | null = null, prevT = 0;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const c = path(t), s = sideOf(t).multiplyScalar(width(t) / 2);
    const row = [c.clone().sub(s), c, c.clone().add(s)];
    if (prev) {
      const [ct0, ct1] = [lerpColor(base, tip, prevT), lerpColor(base, tip, t)];
      const [e0, e1] = [lerpColor(ct0, edge, 0.6), lerpColor(ct1, edge, 0.6)];
      // Two quads across: edge→midrib and midrib→edge.
      for (const i0 of [0, 1]) {
        const [a, bb, cc, d] = [prev[i0], prev[i0 + 1], row[i0 + 1], row[i0]];
        const [ca, cb, cc1, cd] = i0 === 0 ? [e0, ct0, ct1, e1] : [ct0, e0, e1, ct1];
        b.tri(a, bb, cc, ca, cb, cc1, swayAt(a, prevT), swayAt(bb, prevT), swayAt(cc, t));
        b.tri(a, cc, d, ca, cc1, cd, swayAt(a, prevT), swayAt(cc, t), swayAt(d, t));
      }
    }
    prev = row;
    prevT = t;
  }
}

/** A small diamond leaf at `p` facing `normal`, `size` long along `along`. */
function diamond(b: MeshBuilder, p: Vector3, normal: Vector3, along: Vector3, size: number, col: Color, s: number) {
  const side = tmp().crossVectors(normal, along).normalize().multiplyScalar(size * 0.38);
  const fwd = along.clone().normalize().multiplyScalar(size);
  const tipP = p.clone().add(fwd);
  const mid = p.clone().addScaledVector(fwd, 0.45);
  b.tri(p, mid.clone().add(side), tipP, col, col, lerpColor(col, new Color("#ffffff"), 0.08), s, s, s);
  b.tri(p, tipP, mid.clone().sub(side), col, lerpColor(col, new Color("#ffffff"), 0.08), col, s, s, s);
}

const GREENS = {
  dark: new Color("#16361f"), mid: new Color("#2f6a35"), light: new Color("#5d9a45"),
  yellow: new Color("#a9b84c"), deep: new Color("#0f2a18"), glossy: new Color("#3d8048"),
};

/** A plant of `species` standing on (x, y, z) in a pot: leaves into `leaves`, pot into `pots`. */
export function growPlant(leaves: MeshBuilder, pots: MeshBuilder, species: PlantSpecies, at: Vector3, scale: number, seed: number) {
  const r = rng(seed);
  const potH = 0.42 * scale, potR = 0.3 * scale;
  pot(pots, at, potR, potH, r);
  const base = at.clone().setY(at.y + potH - 0.02);
  const swayAt = (p: Vector3) => Math.min(1, Math.max(0, (p.y - base.y) / (1.2 * scale)));

  if (species === "blades") {
    const n = 9 + Math.floor(r() * 7);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, tilt = 0.04 + r() * 0.3;
      const H = (0.6 + r() * 0.55) * scale, w = (0.06 + r() * 0.03) * scale;
      const dir = new Vector3(Math.cos(a), 0, Math.sin(a));
      const start = base.clone().addScaledVector(dir, r() * potR * 0.5);
      const twist = (r() - 0.5) * 1.2;
      leafStrip(
        leaves,
        (t) => start.clone().addScaledVector(dir, Math.sin(tilt) * t * H + t * t * 0.08 * H).addScaledVector(UP, Math.cos(tilt) * t * H),
        (t) => w * (1 - Math.pow(t, 1.6)) + 0.003,
        (t) => new Vector3(-dir.z, 0, dir.x).applyAxisAngle(UP, twist * t),
        jitter(GREENS.deep, r, 1), jitter(GREENS.mid, r, 1), GREENS.yellow, swayAt, 7,
      );
    }
  } else if (species === "arching") {
    const n = 7 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.5;
      const L = (0.75 + r() * 0.45) * scale, w = (0.13 + r() * 0.05) * scale;
      const dir = new Vector3(Math.cos(a), 0, Math.sin(a));
      const rise = 0.5 + r() * 0.35;
      const path = (t: number) => base.clone().addScaledVector(dir, t * L * 0.85).addScaledVector(UP, Math.sin(t * Math.PI * 0.75) * L * rise - t * t * L * 0.3 + 0.12 * scale);
      leafStrip(
        leaves, path,
        (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * w + 0.002,
        (t) => {
          const tangent = path(Math.min(1, t + 0.02)).sub(path(Math.max(0, t - 0.02))).normalize();
          return tmp().crossVectors(tangent, UP).normalize();
        },
        jitter(GREENS.dark, r, 1), jitter(GREENS.glossy, r, 1), GREENS.light, swayAt, 10,
      );
    }
  } else {
    const n = 140 + Math.floor(r() * 60);
    const R = 0.36 * scale, cy = base.y + R * 0.95;
    for (let i = 0; i < n; i++) {
      const u = r(), v = r();
      const theta = u * Math.PI * 2, phi = Math.acos(1 - v * 1.6);
      const normal = new Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      const p = new Vector3(at.x, cy, at.z).addScaledVector(normal, R * (0.75 + r() * 0.3));
      const along = tmp().crossVectors(normal, new Vector3(r() - 0.5, r() - 0.5, r() - 0.5)).normalize();
      diamond(leaves, p, normal, along, (0.08 + r() * 0.05) * scale, jitter(lerpColor(GREENS.mid, GREENS.light, r()), r, 1.5), swayAt(p));
    }
  }
}

const POT_COLORS = [new Color("#3b3936"), new Color("#d6d2ca"), new Color("#1b1b1d"), new Color("#7a5a44")];

/** A tapered, slightly rounded pot with soil. */
function pot(b: MeshBuilder, at: Vector3, r: number, h: number, rand: Rng) {
  const col = POT_COLORS[Math.floor(rand() * POT_COLORS.length)];
  const soil = new Color("#20170f");
  const segs = 20;
  const ring = (y: number, rad: number) => Array.from({ length: segs }, (_, i) => {
    const a = (i / segs) * Math.PI * 2;
    return new Vector3(at.x + Math.cos(a) * rad, at.y + y, at.z + Math.sin(a) * rad);
  });
  const bottom = ring(0, r * 0.78), top = ring(h, r), lip = ring(h, r * 0.9), soilRing = ring(h - 0.04, r * 0.9);
  const center = new Vector3(at.x, at.y + h - 0.04, at.z);
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    b.quad(bottom[i], bottom[j], top[j], top[i], col);
    b.quad(top[i], top[j], lip[j], lip[i], col.clone().multiplyScalar(1.08));
    b.quad(lip[i], lip[j], soilRing[j], soilRing[i], col.clone().multiplyScalar(0.7));
    b.tri(soilRing[i], soilRing[j], center, soil, soil, soil);
  }
}

/** A large planter for a tree. */
export function planter(b: MeshBuilder, at: Vector3, r: number) {
  const rand = rng(at.x, at.z);
  const segs = 40;
  const col = new Color("#cfc9bf");
  const ring = (y: number, rad: number) => Array.from({ length: segs }, (_, i) => {
    const a = (i / segs) * Math.PI * 2;
    return new Vector3(at.x + Math.cos(a) * rad, at.y + y, at.z + Math.sin(a) * rad);
  });
  const [b0, t0, t1, s0] = [ring(0, r), ring(0.62, r), ring(0.62, r - 0.12), ring(0.55, r - 0.12)];
  const center = new Vector3(at.x, at.y + 0.55, at.z);
  const moss = new Color("#24401f");
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    b.quad(b0[i], b0[j], t0[j], t0[i], col.clone().multiplyScalar(0.92 + rand() * 0.06));
    b.quad(t0[i], t0[j], t1[j], t1[i], col);
    b.quad(t1[i], t1[j], s0[j], s0[i], col.clone().multiplyScalar(0.6));
    b.tri(s0[i], s0[j], center, moss, moss, moss);
  }
}

/** A branching tree grown by recursion: bark into `bark`, leaf clusters into `leaves`. */
export function growTree(leaves: MeshBuilder, bark: MeshBuilder, at: Vector3, height: number, seed: number) {
  const r = rng(seed);
  const barkCol = new Color("#4a3f36");
  const scale = height / 9.5;
  const branch = (start: Vector3, dir: Vector3, length: number, radius: number, depth: number) => {
    const end = start.clone().addScaledVector(dir, length);
    tube(bark, start, end, radius, radius * 0.7, barkCol);
    if (depth === 0 || radius < 0.02) {
      const n = 50 + Math.floor(r() * 25);
      for (let i = 0; i < n; i++) {
        const off = new Vector3(r() - 0.5, (r() - 0.3) * 0.8, r() - 0.5).multiplyScalar(1.4 * scale);
        const p = end.clone().add(off);
        const normal = off.clone().normalize().lerp(UP, 0.4).normalize();
        const along = new Vector3(r() - 0.5, -0.3 - r() * 0.5, r() - 0.5).normalize();
        const col = jitter(lerpColor(GREENS.mid, GREENS.light, r() * 0.8), r, 1.6);
        diamond(leaves, p, normal, along, (0.09 + r() * 0.06) * scale, col, Math.min(1, (p.y - at.y) / height + 0.3));
      }
      return;
    }
    const children = depth >= 4 ? 2 : 2 + Math.floor(r() * 2);
    for (let i = 0; i < children; i++) {
      const axis = new Vector3(r() - 0.5, 0, r() - 0.5).normalize();
      const spread = 0.35 + r() * 0.45;
      const d = dir.clone().applyAxisAngle(axis, spread).lerp(UP, 0.15).normalize();
      branch(end, d, length * (0.68 + r() * 0.12), radius * 0.62, depth - 1);
    }
    // The leader carries on, a little bent.
    if (depth >= 3) branch(end, dir.clone().add(new Vector3((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3)).normalize(), length * 0.75, radius * 0.72, depth - 1);
  };
  branch(at.clone().setY(at.y + 0.5), new Vector3((r() - 0.5) * 0.1, 1, (r() - 0.5) * 0.1).normalize(), 3.2 * scale, 0.2 * scale, 5);
}

/** A six-sided tapered tube between two points. */
function tube(b: MeshBuilder, from: Vector3, to: Vector3, r0: number, r1: number, col: Color) {
  const axis = to.clone().sub(from).normalize();
  const ref = Math.abs(axis.y) < 0.9 ? UP : new Vector3(1, 0, 0);
  const u = tmp().crossVectors(axis, ref).normalize(), v = tmp().crossVectors(axis, u).normalize();
  const sides = 6;
  const ring = (c: Vector3, rad: number) => Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return c.clone().addScaledVector(u, Math.cos(a) * rad).addScaledVector(v, Math.sin(a) * rad);
  });
  const [a, bb] = [ring(from, r0), ring(to, r1)];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    b.quad(a[i], a[j], bb[j], bb[i], col.clone().multiplyScalar(0.85 + (i % 2) * 0.15));
  }
}

/** Ivy strands hanging from a balcony edge, leaves facing `out` (toward the open atrium). */
export function growIvy(leaves: MeshBuilder, x1: number, z1: number, x2: number, z2: number, y: number, out: Vector3, seed: number) {
  const r = rng(seed);
  const len = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.floor(len / 0.22);
  for (let i = 0; i <= steps; i++) {
    if (r() < 0.3) continue;
    const t = i / steps;
    const top = new Vector3(x1 + (x2 - x1) * t, y - 0.02, z1 + (z2 - z1) * t).addScaledVector(out, 0.04);
    const hang = 0.8 + Math.pow(r(), 1.5) * 3.4;
    const phase = r() * 6;
    for (let d = 0; d < hang; d += 0.07 + r() * 0.04) {
      const p = top.clone().add(new Vector3(0, -d, 0)).addScaledVector(out, Math.sin(d * 2 + phase) * 0.05 + 0.03);
      const along = new Vector3((r() - 0.5) * 0.6, -1, (r() - 0.5) * 0.6).normalize();
      const col = jitter(lerpColor(GREENS.dark, GREENS.mid, r()), r, 1.4);
      diamond(leaves, p, out.clone().add(new Vector3((r() - 0.5) * 0.6, 0.2, (r() - 0.5) * 0.6)).normalize(), along, 0.08 + r() * 0.05, col, Math.min(1, d / 2.5));
    }
  }
}
