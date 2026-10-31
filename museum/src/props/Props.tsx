import { useMemo } from "react";
import { BoxGeometry, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { BENCH_DEPTH, SEAT_HEIGHT, type Prop } from "../../../shared/museum/props";
import { MeshBuilder, growIvy, growPlant, growTree, planter } from "./plantGeometry";
import { leafMaterial, steelMaterial, stoneMaterial, vertexColorMaterial, woodMaterial } from "../world/materials";

type Bench = Extract<Prop, { kind: "bench" }>;

/** A box placed in a bench's local frame (x along the seat), then into the world. */
function benchBox(bench: Bench, size: [number, number, number], center: [number, number, number]) {
  const g = new BoxGeometry(...size);
  const m = new Matrix4().compose(
    new Vector3(bench.x, bench.y, bench.z),
    new Quaternion().setFromEuler(new Euler(0, bench.yaw, 0)),
    new Vector3(1, 1, 1),
  ).multiply(new Matrix4().makeTranslation(...center));
  return g.applyMatrix4(m);
}

/** Bench designs: 0 is an oak slab on two dark steel blades, 1 a travertine block on a shadow gap. */
function benchParts(bench: Bench) {
  const L = bench.length, D = BENCH_DEPTH, H = SEAT_HEIGHT;
  if (bench.style === 0) {
    return {
      wood: [benchBox(bench, [L, 0.06, D], [0, H - 0.03, 0])],
      steel: [-1, 1].map((s) => benchBox(bench, [0.04, H - 0.06, D * 0.86], [s * (L / 2 - 0.28), (H - 0.06) / 2, 0])),
      stone: [] as BufferGeometry[],
    };
  }
  return {
    wood: [] as BufferGeometry[],
    steel: [benchBox(bench, [L - 0.12, 0.05, D - 0.12], [0, 0.025, 0])],
    stone: [benchBox(bench, [L, H - 0.05, D], [0, 0.05 + (H - 0.05) / 2, 0])],
  };
}

const merge = (parts: BufferGeometry[]) => (parts.length ? mergeGeometries(parts) : null);

/** All plants, trees, ivy and benches: built once from the prop list, a handful of draw calls in total. */
export function Props({ props }: { props: Prop[] }) {
  const built = useMemo(() => {
    const leaves = new MeshBuilder(), pots = new MeshBuilder(), bark = new MeshBuilder(), planters = new MeshBuilder();
    const wood: BufferGeometry[] = [], steel: BufferGeometry[] = [], stone: BufferGeometry[] = [];
    for (const p of props) {
      if (p.kind === "plant") growPlant(leaves, pots, p.species, new Vector3(p.x, p.y, p.z), p.scale, p.seed);
      else if (p.kind === "tree") {
        planter(planters, new Vector3(p.x, p.y, p.z), p.planter);
        growTree(leaves, bark, new Vector3(p.x, p.y, p.z), p.height, p.seed);
      } else if (p.kind === "ivy") {
        // Leaves face away from the balcony, toward the middle of the atrium.
        const mx = (p.x1 + p.x2) / 2, mz = (p.z1 + p.z2) / 2;
        const out = p.x1 === p.x2 ? new Vector3(-Math.sign(mx), 0, 0) : new Vector3(0, 0, -Math.sign(mz));
        growIvy(leaves, p.x1, p.z1, p.x2, p.z2, p.y - 0.4, out, p.seed);
      } else {
        const parts = benchParts(p);
        wood.push(...parts.wood); steel.push(...parts.steel); stone.push(...parts.stone);
      }
    }
    return {
      leaves: leaves.build(), pots: pots.build(), bark: bark.build(), planters: planters.build(),
      wood: merge(wood), steel: merge(steel), stone: merge(stone),
    };
  }, [props]);

  const mats = useMemo(() => ({
    leaf: leafMaterial(), pot: vertexColorMaterial(0.7), bark: vertexColorMaterial(0.9), planter: vertexColorMaterial(0.65),
    wood: woodMaterial(), steel: steelMaterial(), stone: stoneMaterial(),
  }), []);

  const benches = props.filter((p): p is Bench => p.kind === "bench");

  return (
    <group>
      <mesh geometry={built.leaves} material={mats.leaf} castShadow receiveShadow />
      <mesh geometry={built.pots} material={mats.pot} castShadow receiveShadow />
      <mesh geometry={built.bark} material={mats.bark} castShadow receiveShadow />
      <mesh geometry={built.planters} material={mats.planter} castShadow receiveShadow />
      {built.wood && <mesh geometry={built.wood} material={mats.wood} castShadow receiveShadow />}
      {built.steel && <mesh geometry={built.steel} material={mats.steel} castShadow receiveShadow />}
      {built.stone && <mesh geometry={built.stone} material={mats.stone} castShadow receiveShadow />}

      {/* Invisible boxes the crosshair can find, to offer a seat. */}
      {benches.map((b, i) => (
        <mesh key={i} position={[b.x, b.y + SEAT_HEIGHT / 2, b.z]} rotation={[0, b.yaw, 0]} userData={{ seat: i }}>
          <boxGeometry args={[b.length, SEAT_HEIGHT + 0.1, BENCH_DEPTH + 0.1]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}

      <RigidBody type="fixed" colliders={false}>
        {props.map((p, i) => {
          if (p.kind === "ivy") return null;
          if (p.kind === "bench") {
            return <CuboidCollider key={i} args={[p.length / 2, SEAT_HEIGHT / 2, BENCH_DEPTH / 2]} position={[p.x, p.y + SEAT_HEIGHT / 2, p.z]} rotation={[0, p.yaw, 0]} />;
          }
          return <CylinderCollider key={i} args={[0.4, p.r]} position={[p.x, p.y + 0.4, p.z]} />;
        })}
      </RigidBody>
    </group>
  );
}
