import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Group, IcosahedronGeometry, Vector3, type BufferGeometry } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ATRIUM, LEVEL_HEIGHT, railings } from "../../../shared/museum/atrium";
import { hash, rng, type Rng } from "../../../shared/museum/rng";
import { MeshBuilder, growTree } from "../props/plantGeometry";
import { ambience } from "../audio/ambience";

/**
 * Small birds living in the atrium: they perch on the trees' outer branches and the balcony
 * handrail, look around, and every so often fly an arc to another perch, chirping now and then.
 */

const BIRDS = 6;
const SPECIES = [
  { body: "#7a5a3c", belly: "#cdb08a", head: "#5e4430" }, // sparrow
  { body: "#5a8fb8", belly: "#f0d34a", head: "#2c4d7a" }, // blue tit
  { body: "#6d6152", belly: "#e2733a", head: "#6d6152" }, // robin
];

function birdBody(species: (typeof SPECIES)[number]) {
  const b = new MeshBuilder();
  const blob = (at: Vector3, s: Vector3, top: Color, under: Color) => {
    const g = new IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const tri: Vector3[] = [];
    for (let i = 0; i < p.count; i++) {
      tri.push(new Vector3().fromBufferAttribute(p, i).multiply(s).add(at));
      if (tri.length === 3) {
        const c = (tri[0].y + tri[1].y + tri[2].y) / 3 < at.y ? under : top;
        b.tri(tri[0], tri[1], tri[2], c, c, c);
        tri.length = 0;
      }
    }
  };
  const [body, belly, head] = [new Color(species.body), new Color(species.belly), new Color(species.head)];
  blob(new Vector3(0, 0.035, 0), new Vector3(0.028, 0.026, 0.045), body, belly);
  blob(new Vector3(0, 0.065, 0.035), new Vector3(0.02, 0.02, 0.02), head, belly);
  const beak = new Color("#d9a441"), eye = new Color("#0a0a0a"), tail = body.clone().multiplyScalar(0.8);
  b.tri(new Vector3(-0.006, 0.066, 0.052), new Vector3(0.006, 0.066, 0.052), new Vector3(0, 0.063, 0.068), beak, beak, beak);
  for (const s of [-1, 1]) b.tri(new Vector3(s * 0.016, 0.072, 0.045), new Vector3(s * 0.019, 0.068, 0.045), new Vector3(s * 0.017, 0.07, 0.049), eye, eye, eye);
  b.tri(new Vector3(-0.012, 0.04, -0.035), new Vector3(0.012, 0.04, -0.035), new Vector3(0, 0.05, -0.085), tail, tail, tail);
  return b.build();
}

function wingGeometry(color: string) {
  const b = new MeshBuilder();
  const c = new Color(color).multiplyScalar(0.85);
  // Hinged at x = 0, reaching out along +X.
  b.tri(new Vector3(0, 0, 0.02), new Vector3(0.07, 0, 0), new Vector3(0, 0, -0.03), c, c, c);
  return b.build();
}

type Bird = { perch: number; from: Vector3; to: Vector3; flyStart: number; flyTime: number; nextMove: number; look: number; nextLook: number; yaw: number };

export function Birds({ seed }: { seed: string }) {
  const perches = useMemo(() => {
    const list: Vector3[] = [];
    for (const t of ATRIUM.trees) growTree(new MeshBuilder(), new MeshBuilder(), new Vector3(t.x, 0, t.z), t.height, hash(seed, "atrium", "tree", t.x), list);
    // Every other point along the balcony handrail.
    for (const r of railings()) {
      for (let k = 0.2; k < 1; k += 0.3) list.push(new Vector3(r.x1 + (r.x2 - r.x1) * k, LEVEL_HEIGHT + 1.07, r.z1 + (r.z2 - r.z1) * k));
    }
    return list;
  }, [seed]);

  const parts = useMemo(() => {
    const r = rng(seed, "birds");
    return Array.from({ length: BIRDS }, (_, i) => {
      const species = SPECIES[i % SPECIES.length];
      return { body: birdBody(species), wing: wingGeometry(species.body), offset: r() * 10 };
    });
  }, [seed]);
  const material = useMemo(() => new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, side: 2 }), []);

  const r = useMemo<Rng>(() => rng(seed, "bird-moves"), [seed]);
  const birds = useRef<Bird[]>([]);
  if (!birds.current.length && perches.length) {
    birds.current = parts.map((p, i) => {
      const perch = Math.floor(r() * perches.length);
      return { perch, from: perches[perch], to: perches[perch], flyStart: -1, flyTime: 1, nextMove: 4 + p.offset + i * 3, look: 0, nextLook: 0, yaw: r() * 6.28 };
    });
  }
  const groups = useRef<(Group | null)[]>([]);
  const wings = useRef<(Group | null)[][]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    birds.current.forEach((b, i) => {
      const g = groups.current[i];
      if (!g) return;
      if (b.flyStart < 0 && t > b.nextMove) {
        const taken = new Set(birds.current.map((o) => o.perch));
        let next = b.perch;
        for (let k = 0; k < 8 && taken.has(next); k++) next = Math.floor(r() * perches.length);
        b.from = perches[b.perch];
        b.to = perches[next];
        b.perch = next;
        b.flyStart = t;
        b.flyTime = Math.max(0.8, b.from.distanceTo(b.to) / 4);
        if (r() < 0.6) ambience.chirp(b.from.x, b.from.y, b.from.z);
      }
      let flapping = false;
      if (b.flyStart >= 0) {
        const k = Math.min(1, (t - b.flyStart) / b.flyTime);
        const e = k * k * (3 - 2 * k);
        g.position.lerpVectors(b.from, b.to, e);
        g.position.y += Math.sin(Math.PI * k) * Math.min(2.5, b.flyTime * 0.9);
        b.yaw = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
        flapping = k < 0.9;
        if (k >= 1) { b.flyStart = -1; b.nextMove = t + 6 + r() * 20; }
      } else {
        g.position.copy(b.to);
        // Look around, and hop round now and then.
        if (t > b.nextLook) {
          b.look = (r() - 0.5) * 1.6;
          if (r() < 0.25) b.yaw += (r() - 0.5) * 2.5;
          b.nextLook = t + 0.6 + r() * 2.2;
          if (r() < 0.04) ambience.chirp(g.position.x, g.position.y, g.position.z);
        }
      }
      g.rotation.y = b.yaw + (flapping ? 0 : b.look * 0.3);
      const flap = flapping ? Math.sin(t * 38 + i) * 1.1 : -0.15;
      const [left, right] = wings.current[i] ?? [];
      if (left) left.rotation.z = flap;
      if (right) right.rotation.z = -flap;
    });
  });

  return (
    <group>
      {/* A touch larger than life, so they read from across the atrium. */}
      {parts.map((p, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} userData={{ bird: true }} scale={1.5}>
          <mesh geometry={p.body} material={material} castShadow />
          {[-1, 1].map((s, j) => (
            <group key={s} position={[s * 0.02, 0.045, 0]} scale={[s, 1, 1]} ref={(g) => void ((wings.current[i] ??= [])[j] = g)}>
              <mesh geometry={p.wing as BufferGeometry} material={material} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
