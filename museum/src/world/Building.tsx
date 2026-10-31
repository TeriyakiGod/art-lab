import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3, type Material } from "three";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { DOOR_WIDTH, WALL_THICKNESS, floorY, type FloorPlan, type Room, type Wall } from "../../../shared/museum/generate";
import { ceilingMaterial, floorMaterial, lightMaterial, wallMaterial } from "./materials";

/** One transform (and optional color) per instance. */
type Instance = { p: [number, number, number]; s: [number, number, number]; rx?: number; color?: string };

const T = WALL_THICKNESS;
const isAlongX = (w: Wall) => Math.abs(w.z1 - w.z2) < 1e-6;

/** Each kind of room has its own wall and floor tone; the atrium is lighter, warmer stone. */
const TONES: Record<Room["type"], { wall: string; floor: string; ceiling: string }> = {
  atrium: { wall: "#77736b", floor: "#5c5852", ceiling: "#1a1a1d" },
  gallery: { wall: "#50505a", floor: "#2a2a30", ceiling: "#16161a" },
  corridor: { wall: "#2c2c33", floor: "#1e1e22", ceiling: "#111114" },
};

function wallInstances(plan: FloorPlan): Instance[] {
  return plan.walls.map((w) => {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) + T; // + T closes the corners
    const h = w.y1 - w.y0;
    return {
      p: [(w.x1 + w.x2) / 2, (w.y0 + w.y1) / 2, (w.z1 + w.z2) / 2],
      s: isAlongX(w) ? [len, h, T] : [T, h, len],
      color: TONES[plan.rooms[w.room].type].wall,
    };
  });
}

const floors = (rooms: Room[], y: (r: Room) => number, rx: number, color: (r: Room) => string): Instance[] =>
  rooms.map((r) => ({ p: [r.rect.x + r.rect.w / 2, y(r), r.rect.y + r.rect.d / 2], s: [r.rect.w, r.rect.d, 1], rx, color: color(r) }));

/** Thin lines of light along the top and foot of every gallery wall, and down the middle of corridors. */
function stripInstances(plan: FloorPlan): Instance[] {
  const out: Instance[] = [];
  for (const w of plan.walls) {
    const room = plan.rooms[w.room];
    const base = floorY(room.level);
    if (room.type !== "gallery" || w.y0 > base + 0.01) continue;
    const cx = room.rect.x + room.rect.w / 2, cz = room.rect.y + room.rect.d / 2;
    const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    // Offset from the wall's line toward the room's center.
    const off = T / 2 + 0.02;
    const [ox, oz] = isAlongX(w) ? [0, Math.sign(cz - mz) * off] : [Math.sign(cx - mx) * off, 0];
    const s: [number, number, number] = isAlongX(w) ? [len, 0.035, 0.035] : [0.035, 0.035, len];
    out.push({ p: [mx + ox, base + room.height - 0.25, mz + oz], s, color: room.accent });
    out.push({ p: [mx + ox, base + 0.06, mz + oz], s, color: room.accent });
  }
  for (const r of plan.rooms.filter((r) => r.type === "corridor")) {
    const alongX = r.rect.w > r.rect.d;
    const { x, y, w, d } = r.rect, base = floorY(r.level);
    out.push({ p: [x + w / 2, base + r.height - 0.02, y + d / 2], s: alongX ? [w, 0.03, 0.06] : [0.06, 0.03, d], color: r.accent });
    // Lines along the foot of both side walls lead the way through.
    for (const side of [-1, 1]) {
      const off = side * (DOOR_WIDTH / 2 - T / 2 - 0.03);
      out.push({ p: [x + w / 2 + (alongX ? 0 : off), base + 0.05, y + d / 2 + (alongX ? off : 0)], s: alongX ? [w, 0.025, 0.025] : [0.025, 0.025, d], color: r.accent });
    }
  }
  return out;
}

type InstancesProps = {
  items: Instance[];
  geometry: BoxGeometry | PlaneGeometry;
  material: Material;
  /** Blocks the crosshair from picking art behind it. */
  occluder?: boolean;
  shadows?: boolean;
};

function Instances({ items, geometry, material, occluder, shadows }: InstancesProps) {
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
  return (
    <instancedMesh
      ref={ref} args={[geometry, material, items.length]} frustumCulled={false} userData={{ occluder }}
      castShadow={shadows} receiveShadow={shadows}
    />
  );
}

export function Building({ plan }: { plan: FloorPlan }) {
  const parts = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    const plane = new PlaneGeometry(1, 1);
    return {
      box, plane,
      walls: wallInstances(plan),
      floors: floors(plan.rooms, (r) => floorY(r.level), -Math.PI / 2, (r) => TONES[r.type].floor),
      // The atrium draws its own ceiling, with the skylight.
      ceilings: floors(plan.rooms.filter((r) => r.type !== "atrium"), (r) => floorY(r.level) + r.height, Math.PI / 2, (r) => TONES[r.type].ceiling),
      strips: stripInstances(plan),
      wallMaterial: wallMaterial(),
      floorMaterial: floorMaterial(),
      ceilingMaterial: ceilingMaterial(),
      stripMaterial: lightMaterial(2.4),
    };
  }, [plan]);

  // Physics: every wall, one floor under the whole ground level, and a floor for each upstairs room.
  const bounds = useMemo(() => {
    const xs = plan.rooms.flatMap((r) => [r.rect.x, r.rect.x + r.rect.w]);
    const zs = plan.rooms.flatMap((r) => [r.rect.y, r.rect.y + r.rect.d]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }, [plan]);
  const upstairs = plan.rooms.filter((r) => r.level > 0);

  return (
    <>
      <Instances items={parts.walls} geometry={parts.box} material={parts.wallMaterial} occluder shadows />
      <Instances items={parts.floors} geometry={parts.plane} material={parts.floorMaterial} shadows />
      <Instances items={parts.ceilings} geometry={parts.plane} material={parts.ceilingMaterial} shadows />
      <Instances items={parts.strips} geometry={parts.box} material={parts.stripMaterial} />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[(bounds.x1 - bounds.x0) / 2 + 2, 0.5, (bounds.z1 - bounds.z0) / 2 + 2]}
          position={[(bounds.x0 + bounds.x1) / 2, -0.5, (bounds.z0 + bounds.z1) / 2]}
        />
        {upstairs.map((r) => (
          <CuboidCollider key={r.id} args={[r.rect.w / 2, 0.2, r.rect.d / 2]} position={[r.rect.x + r.rect.w / 2, floorY(r.level) - 0.2, r.rect.y + r.rect.d / 2]} />
        ))}
        {parts.walls.map((w, i) => <CuboidCollider key={i} args={[w.s[0] / 2, w.s[1] / 2, w.s[2] / 2]} position={w.p} />)}
      </RigidBody>
    </>
  );
}
