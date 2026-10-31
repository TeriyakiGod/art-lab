import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CircleGeometry, Color, Group, IcosahedronGeometry, Vector3, type BufferGeometry } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { attribute, positionLocal, sin, time, uniform, vec3 } from "three/tsl";
import { ATRIUM } from "../../../shared/museum/atrium";
import { hash, rng, type Rng } from "../../../shared/museum/rng";
import { MeshBuilder } from "../props/plantGeometry";
import { ambience } from "../audio/ambience";

/**
 * Life in the reflecting pool: mossy rocks where the water lands, koi swimming loops under the
 * surface, lily pads bobbing, and frogs that sit on them and now and then hop to another.
 * All grown in code from seeds.
 */

const { pool } = ATRIUM;
const WATER = pool.water;

// ---- rocks ----

/** A boulder: an icosphere pushed in and out by seeded noise, flatter than tall, mossy on top. */
function rock(b: MeshBuilder, at: Vector3, size: number, seed: number) {
  const r = rng("rock", seed);
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  const bump = new Map<string, number>();
  const squash = 0.55 + r() * 0.25;
  const stone = new Color().setHSL(0.08 + r() * 0.04, 0.08, 0.28 + r() * 0.1);
  const moss = new Color("#3d5a2a");
  const tri: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new Vector3().fromBufferAttribute(pos, i);
    // Shared corners move together (the geometry isn't indexed), keyed by their position.
    const key = v.toArray().map((n) => n.toFixed(3)).join();
    if (!bump.has(key)) bump.set(key, 0.75 + r() * 0.45);
    v.multiplyScalar(bump.get(key)!).multiply(new Vector3(size, size * squash, size * (0.8 + r() * 0.1))).add(at);
    tri.push(v);
    if (tri.length === 3) {
      const n = new Vector3().subVectors(tri[1], tri[0]).cross(new Vector3().subVectors(tri[2], tri[0])).normalize();
      const col = stone.clone().lerp(moss, n.y > 0.6 ? 0.55 : 0).multiplyScalar(0.9 + r() * 0.2);
      b.tri(tri[0], tri[1], tri[2], col, col, col);
      tri.length = 0;
    }
  }
}

const ROCKS: [number, number, number, number][] = [
  // x, z, size, sink (how far below the water line the center sits)
  [-3.1, -11.2, 0.75, 0.25], [-1.7, -11.5, 0.55, 0.2], [2.4, -11.3, 0.85, 0.3], [3.7, -10.7, 0.5, 0.15], [0.4, -11.6, 0.45, 0.25],
  [-3.9, -6, 0.42, 0.18], [3.8, -5.6, 0.38, 0.15], [-0.8, -8.2, 0.5, 0.25],
];

// ---- koi ----

/** A koi along +Z: elliptical body, forked tail, small fins; white with orange and black patches. */
function koiGeometry(seed: number): BufferGeometry {
  const r = rng("koi", seed);
  const b = new MeshBuilder();
  const L = 0.42 + r() * 0.14, rings = 12, sides = 8;
  const white = new Color("#f3ece2"), orange = new Color(["#e4571b", "#f08a24", "#d93b1c"][Math.floor(r() * 3)]), black = new Color("#161414");
  const patches = Array.from({ length: 5 }, () => ({ t: r(), a: r() * 6.28, s: 0.12 + r() * 0.14, c: r() < 0.75 ? orange : black }));
  const colorAt = (t: number, a: number) => {
    for (const p of patches) if (Math.hypot(t - p.t, (Math.sin(a - p.a)) * 0.15) < p.s) return p.c;
    return r() < 0.02 ? orange : white;
  };
  const ring = (t: number) => {
    const rad = Math.max(0.004, 0.075 * Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.62))) * (L / 0.5));
    return Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return { p: new Vector3(Math.cos(a) * rad, Math.sin(a) * rad * 0.72, (0.5 - t) * L), a };
    });
  };
  // `sway` here is how far along the body (0 head, 1 tail), for the swimming wave.
  for (let i = 0; i < rings; i++) {
    const [t0, t1] = [i / rings, (i + 1) / rings];
    const [a, c] = [ring(t0), ring(t1)];
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      const col = colorAt(t0, a[j].a);
      b.tri(a[j].p, a[k].p, c[k].p, col, col, col, t0, t0, t1);
      b.tri(a[j].p, c[k].p, c[j].p, col, col, col, t0, t1, t1);
    }
  }
  // Tail fin and fins, a translucent-looking orange-white.
  const fin = white.clone().lerp(orange, 0.35);
  const tailBase = new Vector3(0, 0, -0.5 * L);
  b.tri(tailBase, new Vector3(0, 0.07, -0.5 * L - 0.12), new Vector3(0, 0, -0.5 * L - 0.07), fin, fin, fin, 1, 1.25, 1.2);
  b.tri(tailBase, new Vector3(0, 0, -0.5 * L - 0.07), new Vector3(0, -0.07, -0.5 * L - 0.12), fin, fin, fin, 1, 1.2, 1.25);
  for (const s of [-1, 1]) b.tri(new Vector3(s * 0.03, -0.01, 0.12 * L), new Vector3(s * 0.09, -0.03, 0.02 * L), new Vector3(s * 0.035, -0.015, 0.02 * L), fin, fin, fin, 0.3, 0.4, 0.4);
  b.tri(new Vector3(0, 0.045, 0.1 * L), new Vector3(0, 0.085, -0.05 * L), new Vector3(0, 0.04, -0.2 * L), fin, fin, fin, 0.4, 0.55, 0.7);
  return b.build();
}

/** Body wave: the tail swings most, faster when the fish swims faster. */
function koiMaterial(speed: number, phase: number) {
  const m = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.35 });
  const along = attribute("sway", "float");
  const wave = sin(time.mul(uniform(6 * speed)).add(uniform(phase)).sub(along.mul(4.5))).mul(along.mul(along).mul(0.05));
  m.positionNode = positionLocal.add(vec3(wave, 0, 0));
  return m;
}

type Koi = { geometry: BufferGeometry; material: MeshStandardNodeMaterial; cx: number; cz: number; rx: number; rz: number; speed: number; phase: number; depth: number };

function makeKoi(seed: string): Koi[] {
  const r = rng(seed, "koi");
  return Array.from({ length: 7 }, (_, i) => {
    const speed = 0.55 + r() * 0.5, phase = r() * 6.28;
    return {
      geometry: koiGeometry(hash(seed, "koi", i)), material: koiMaterial(speed, phase),
      cx: -1.8 + r() * 3.6, cz: -8 + r() * 1.6, rx: 1.2 + r() * 1.4, rz: 0.7 + r() * 0.6, speed: speed * 0.18, phase, depth: 0.1 + r() * 0.12,
    };
  });
}

/** Where a koi is at time t: a figure-eight loop, kept clear of the rocks by the wall. */
function koiAt(k: Koi, t: number) {
  const a = k.phase + t * k.speed;
  return new Vector3(k.cx + Math.cos(a) * k.rx, WATER - k.depth, k.cz + Math.sin(2 * a) * k.rz * 0.6);
}

// ---- lily pads and frogs ----

const PADS: [number, number, number][] = [[-2.8, -6.2, 0.28], [-1.2, -9.4, 0.22], [1.6, -6.6, 0.3], [3.2, -8.6, 0.24], [0.2, -7.3, 0.2], [-3.6, -8.9, 0.26], [2.6, -9.9, 0.2]];

function padGeometry(size: number, seed: number) {
  const g = new CircleGeometry(size, 18, 0.25, Math.PI * 2 - 0.5);
  g.rotateX(-Math.PI / 2);
  g.rotateY(rng("pad", seed)() * 6.28);
  return g;
}

/** A sitting frog facing +Z, about 12 cm long. */
function frogGeometry(seed: number) {
  const r = rng("frog", seed);
  const b = new MeshBuilder();
  const skin = new Color().setHSL(0.27 + r() * 0.06, 0.5, 0.28 + r() * 0.08);
  const belly = new Color("#c9c48a"), eyeW = new Color("#e8e2c0"), eyeB = new Color("#0c0c0c");
  const blob = (at: Vector3, s: Vector3, col: Color, under?: Color) => {
    const g = new IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const tri: Vector3[] = [];
    for (let i = 0; i < p.count; i++) {
      tri.push(new Vector3().fromBufferAttribute(p, i).multiply(s).add(at));
      if (tri.length === 3) {
        const c = under && (tri[0].y + tri[1].y + tri[2].y) / 3 < at.y - s.y * 0.3 ? under : col;
        b.tri(tri[0], tri[1], tri[2], c, c, c);
        tri.length = 0;
      }
    }
  };
  blob(new Vector3(0, 0.035, 0), new Vector3(0.045, 0.032, 0.06), skin, belly);
  blob(new Vector3(0, 0.05, 0.045), new Vector3(0.038, 0.025, 0.03), skin, belly);
  for (const s of [-1, 1]) {
    blob(new Vector3(s * 0.022, 0.075, 0.05), new Vector3(0.013, 0.013, 0.013), eyeW);
    blob(new Vector3(s * 0.026, 0.077, 0.059), new Vector3(0.006, 0.007, 0.005), eyeB);
    blob(new Vector3(s * 0.045, 0.018, -0.025), new Vector3(0.02, 0.016, 0.04), skin);
    blob(new Vector3(s * 0.03, 0.01, 0.05), new Vector3(0.01, 0.01, 0.02), skin);
  }
  return b.build();
}

type Frog = { pad: number; from: number; hopAt: number; hopStart: number };

export function Pond({ seed }: { seed: string }) {
  const built = useMemo(() => {
    const rocks = new MeshBuilder();
    ROCKS.forEach(([x, z, s, sink], i) => rock(rocks, new Vector3(x, WATER - sink, z), s, hash(seed, "rock", i)));
    return {
      rocks: rocks.build(),
      koi: makeKoi(seed),
      pads: PADS.map(([, , s], i) => padGeometry(s, hash(seed, i))),
      frogs: [0, 1, 2].map((i) => frogGeometry(hash(seed, "frog", i))),
      materials: {
        rock: new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85 }),
        pad: new MeshStandardNodeMaterial({ color: "#3a6a2c", roughness: 0.6 }),
        frog: new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.45 }),
        lotus: new MeshStandardNodeMaterial({ color: "#f2b8c9", roughness: 0.5, emissive: "#3a1820" }),
        bottom: new MeshStandardNodeMaterial({ color: "#081517", roughness: 0.9 }),
      },
    };
  }, [seed]);

  const koiRefs = useRef<(Group | null)[]>([]);
  const padRefs = useRef<(Group | null)[]>([]);
  const frogRefs = useRef<(Group | null)[]>([]);
  const frogs = useRef<Frog[]>([{ pad: 0, from: 0, hopAt: 9, hopStart: -1 }, { pad: 3, from: 3, hopAt: 21, hopStart: -1 }, { pad: 5, from: 5, hopAt: 33, hopStart: -1 }]);
  const croakAt = useRef(6);
  const r = useMemo<Rng>(() => rng(seed, "frogs"), [seed]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    built.koi.forEach((k, i) => {
      const g = koiRefs.current[i];
      if (!g) return;
      const p = koiAt(k, t), ahead = koiAt(k, t + 0.1);
      g.position.copy(p);
      g.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    });
    const padY = (i: number) => WATER + 0.005 + Math.sin(t * 0.8 + i * 1.7) * 0.006;
    PADS.forEach(([x, z], i) => {
      const g = padRefs.current[i];
      if (g) g.position.set(x + Math.sin(t * 0.13 + i) * 0.05, padY(i), z + Math.cos(t * 0.11 + i * 2) * 0.05);
    });
    frogs.current.forEach((f, i) => {
      const g = frogRefs.current[i];
      if (!g) return;
      // Now and then, hop to a free pad.
      if (f.hopStart < 0 && t > f.hopAt) {
        const taken = new Set(frogs.current.map((o) => o.pad));
        const free = PADS.map((_, j) => j).filter((j) => !taken.has(j));
        f.from = f.pad;
        f.pad = free[Math.floor(r() * free.length)] ?? f.pad;
        f.hopStart = t;
      }
      const at = (j: number) => padRefs.current[j]?.position ?? new Vector3(PADS[j][0], WATER, PADS[j][1]);
      if (f.hopStart >= 0) {
        const k = Math.min(1, (t - f.hopStart) / 0.7);
        const a = at(f.from), b = at(f.pad);
        g.position.lerpVectors(a, b, k);
        g.position.y += Math.sin(Math.PI * k) * 0.45;
        g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        if (k >= 1) { f.hopStart = -1; f.hopAt = t + 15 + r() * 30; }
      } else {
        g.position.copy(at(f.pad));
        // Breathing: the throat puffs.
        g.scale.set(1, 1 + Math.max(0, Math.sin(t * 2.2 + i * 2)) * 0.06, 1);
      }
    });
    if (t > croakAt.current) {
      croakAt.current = t + 12 + r() * 25;
      const f = frogRefs.current[Math.floor(r() * 3)];
      if (f) ambience.croak(f.position.x, f.position.y, f.position.z);
    }
  });

  return (
    <group>
      <mesh geometry={built.rocks} material={built.materials.rock} castShadow receiveShadow />
      {/* A dark pool floor, seen through the water. */}
      <mesh position={[(pool.x0 + pool.x1) / 2, 0.02, (pool.z0 + pool.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={built.materials.bottom}>
        <planeGeometry args={[pool.x1 - pool.x0, pool.z1 - pool.z0]} />
      </mesh>
      {built.koi.map((k, i) => (
        <group key={i} ref={(g) => void (koiRefs.current[i] = g)}>
          <mesh geometry={k.geometry} material={k.material} />
        </group>
      ))}
      {built.pads.map((g, i) => (
        <group key={i} ref={(el) => void (padRefs.current[i] = el)}>
          <mesh geometry={g} material={built.materials.pad} receiveShadow />
          {(i === 1 || i === 4) && (
            <mesh position={[0.05, 0.04, 0.03]} material={built.materials.lotus} castShadow>
              <coneGeometry args={[0.07, 0.09, 7, 1, true]} />
            </mesh>
          )}
        </group>
      ))}
      {built.frogs.map((g, i) => (
        <group key={i} ref={(el) => void (frogRefs.current[i] = el)}>
          <mesh geometry={g} material={built.materials.frog} castShadow />
        </group>
      ))}
    </group>
  );
}
