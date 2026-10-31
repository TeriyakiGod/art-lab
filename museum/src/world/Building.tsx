import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from "three";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { WALL_THICKNESS, type FloorPlan, type Room, type Wall } from "../../../shared/museum/generate";

/** One transform (and optional color) per instance. */
type Instance = { p: [number, number, number]; s: [number, number, number]; rx?: number; color?: string };

const T = WALL_THICKNESS;
const isAlongX = (w: Wall) => Math.abs(w.z1 - w.z2) < 1e-6;

function wallInstances(plan: FloorPlan): Instance[] {
  return plan.walls.map((w) => {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) + T; // + T closes the corners
    const h = w.y1 - w.y0;
    return {
      p: [(w.x1 + w.x2) / 2, (w.y0 + w.y1) / 2, (w.z1 + w.z2) / 2],
      s: isAlongX(w) ? [len, h, T] : [T, h, len],
    };
  });
}

const floors = (rooms: Room[], y: (r: Room) => number, rx: number, color: (r: Room) => string | undefined): Instance[] =>
  rooms.map((r) => ({ p: [r.rect.x + r.rect.w / 2, y(r), r.rect.y + r.rect.d / 2], s: [r.rect.w, r.rect.d, 1], rx, color: color(r) }));

/** Thin lines of light along the top and foot of every gallery wall, and down the middle of corridors. */
function stripInstances(plan: FloorPlan): Instance[] {
  const out: Instance[] = [];
  for (const w of plan.walls) {
    const room = plan.rooms[w.room];
    if (w.y0 > 0) continue;
    if (room.type === "corridor") continue;
    const cx = room.rect.x + room.rect.w / 2, cz = room.rect.y + room.rect.d / 2;
    const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    // Offset from the wall's line toward the room's center.
    const off = T / 2 + 0.02;
    const [ox, oz] = isAlongX(w) ? [0, Math.sign(cz - mz) * off] : [Math.sign(cx - mx) * off, 0];
    const s: [number, number, number] = isAlongX(w) ? [len, 0.035, 0.035] : [0.035, 0.035, len];
    out.push({ p: [mx + ox, room.height - 0.25, mz + oz], s, color: room.accent });
    out.push({ p: [mx + ox, 0.06, mz + oz], s, color: room.accent });
  }
  for (const r of plan.rooms.filter((r) => r.type === "corridor")) {
    const alongX = r.rect.w > r.rect.d;
    out.push({
      p: [r.rect.x + r.rect.w / 2, r.height - 0.02, r.rect.y + r.rect.d / 2],
      s: alongX ? [r.rect.w, 0.03, 0.06] : [0.06, 0.03, r.rect.d],
      color: r.accent,
    });
  }
  return out;
}

type InstancesProps = {
  items: Instance[];
  geometry: BoxGeometry | PlaneGeometry;
  material: MeshStandardMaterial | MeshBasicMaterial;
  /** Blocks the crosshair from picking art behind it. */
  occluder?: boolean;
};

function Instances({ items, geometry, material, occluder }: InstancesProps) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const m = new Matrix4(), q = new Quaternion(), axis = new Vector3(1, 0, 0), c = new Color();
    items.forEach((it, i) => {
      q.setFromAxisAngle(axis, it.rx ?? 0);
      m.compose(new Vector3(...it.p), q, new Vector3(...it.s));
      mesh.setMatrixAt(i, m);
      if (it.color) mesh.setColorAt(i, c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} userData={{ occluder }} />;
}

export function Building({ plan }: { plan: FloorPlan }) {
  const parts = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    const plane = new PlaneGeometry(1, 1);
    return {
      box, plane,
      walls: wallInstances(plan),
      floors: floors(plan.rooms, () => 0, -Math.PI / 2, (r) => (r.type === "atrium" ? "#16161c" : "#0f0f13")),
      ceilings: floors(plan.rooms, (r) => r.height, Math.PI / 2, () => "#0c0c10"),
      strips: stripInstances(plan),
      wallMaterial: new MeshStandardMaterial({ color: "#24242c", roughness: 0.92 }),
      floorMaterial: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.35, metalness: 0.15 }),
      ceilingMaterial: new MeshStandardMaterial({ color: "#ffffff", roughness: 1 }),
      stripMaterial: new MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
    };
  }, [plan]);

  // Physics only needs the walls people can walk into, and one floor under everything.
  const bounds = useMemo(() => {
    const xs = plan.rooms.flatMap((r) => [r.rect.x, r.rect.x + r.rect.w]);
    const zs = plan.rooms.flatMap((r) => [r.rect.y, r.rect.y + r.rect.d]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }, [plan]);

  return (
    <>
      <Instances items={parts.walls} geometry={parts.box} material={parts.wallMaterial} occluder />
      <Instances items={parts.floors} geometry={parts.plane} material={parts.floorMaterial} />
      <Instances items={parts.ceilings} geometry={parts.plane} material={parts.ceilingMaterial} />
      <Instances items={parts.strips} geometry={parts.box} material={parts.stripMaterial} />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[(bounds.x1 - bounds.x0) / 2 + 2, 0.5, (bounds.z1 - bounds.z0) / 2 + 2]}
          position={[(bounds.x0 + bounds.x1) / 2, -0.5, (bounds.z0 + bounds.z1) / 2]}
        />
        {parts.walls.map((w, i) =>
          plan.walls[i].y0 === 0 ? <CuboidCollider key={i} args={[w.s[0] / 2, w.s[1] / 2, w.s[2] / 2]} position={w.p} /> : null,
        )}
      </RigidBody>
    </>
  );
}
