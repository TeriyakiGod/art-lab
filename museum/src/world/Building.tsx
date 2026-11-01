import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3, type Material } from "three";
import { useShowWhenNear } from "./nearby";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { WALL_THICKNESS, floorY, type FloorPlan, type Room, type Wall } from "../../../shared/museum/generate";
import { ceilingMaterial, floorMaterial, lightMaterial, steelMaterial, wallMaterial } from "./materials";

/** One transform (and optional color) per instance, and the room it belongs to. */
type Instance = { room: number; p: [number, number, number]; s: [number, number, number]; rx?: number; color?: string };

const T = WALL_THICKNESS;
const isAlongX = (w: Wall) => Math.abs(w.z1 - w.z2) < 1e-6;

/** Each kind of room has its own wall and floor tone; the atrium is lighter, warmer stone. */
const TONES: Record<Room["type"], { wall: string; floor: string; ceiling: string }> = {
  atrium: { wall: "#77736b", floor: "#5c5852", ceiling: "#1a1a1d" },
  gallery: { wall: "#50505a", floor: "#2a2a30", ceiling: "#16161a" },
  corridor: { wall: "#2c2c33", floor: "#1e1e22", ceiling: "#111114" },
};

/** A room's base tone with a little of its wing's theme color mixed in (not the atrium's). */
function tinted(tone: string, room: Room, amount: number) {
  if (room.type === "atrium") return tone;
  return "#" + new Color(tone).lerp(new Color(room.accent), amount).getHexString();
}

function wallInstances(plan: FloorPlan): Instance[] {
  return plan.walls.map((w) => {
    // + T closes a room's corners. Corridor walls end at the face of the room walls at either end
    // instead, so the two rooms' (differently tinted) walls never overlap and flicker.
    const corridor = plan.rooms[w.room].type === "corridor";
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) + (corridor ? -T : T);
    const h = w.y1 - w.y0;
    return {
      room: w.room,
      p: [(w.x1 + w.x2) / 2, (w.y0 + w.y1) / 2, (w.z1 + w.z2) / 2],
      s: isAlongX(w) ? [len, h, T] : [T, h, len],
      color: tinted(TONES[plan.rooms[w.room].type].wall, plan.rooms[w.room], 0.16),
    };
  });
}

const floors = (rooms: Room[], y: (r: Room) => number, rx: number, color: (r: Room) => string, trim = 0): Instance[] =>
  rooms.map((r) => {
    // `trim` shortens corridors at both ends (along their length).
    const t = r.type === "corridor" ? trim : 0, alongX = r.rect.w > r.rect.d;
    return { room: r.id, p: [r.rect.x + r.rect.w / 2, y(r), r.rect.y + r.rect.d / 2], s: [r.rect.w - (alongX ? t : 0), r.rect.d - (alongX ? 0 : t), 1], rx, color: color(r) };
  });

/** Square lamps set into the ceiling: a dark rim with a glowing panel, on a grid in galleries and in a row down corridors. */
function lampInstances(plan: FloorPlan): { rims: Instance[]; panels: Instance[] } {
  const rims: Instance[] = [], panels: Instance[] = [];
  for (const r of plan.rooms) {
    if (r.type === "atrium") continue;
    const { x, y, w, d } = r.rect, top = floorY(r.level) + r.height;
    const size = r.type === "gallery" ? 1 : 0.6;
    const spacing = r.type === "gallery" ? 3.6 : 3;
    const nx = Math.max(1, Math.round(w / spacing)), nz = Math.max(1, Math.round(d / spacing));
    // A little of the wing's theme color in the light.
    const light = "#" + new Color("#fff4e6").lerp(new Color(r.accent), 0.12).getHexString();
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const px = x + (w / nx) * (i + 0.5), pz = y + (d / nz) * (j + 0.5);
        rims.push({ room: r.id, p: [px, top - 0.02, pz], s: [size + 0.1, 0.04, size + 0.1] });
        panels.push({ room: r.id, p: [px, top - 0.045, pz], s: [size, 0.012, size], color: light });
      }
    }
  }
  return { rims, panels };
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
    const mesh = ref.current;
    if (!mesh) return;
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
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref} args={[geometry, material, items.length]} userData={{ occluder }}
      castShadow={shadows} receiveShadow={shadows}
    />
  );
}

type Parts = { walls: Instance[]; floors: Instance[]; ceilings: Instance[]; rims: Instance[]; panels: Instance[] };
type Shared = { box: BoxGeometry; plane: PlaneGeometry; wallMaterial: Material; floorMaterial: Material; ceilingMaterial: Material; lampMaterial: Material; rimMaterial: Material };

/** One room's surfaces, drawn only while the room is near (so a big museum costs no more than a small one). */
function RoomChunk({ room, parts, shared }: { room: number; parts: Parts; shared: Shared }) {
  const group = useRef<Group>(null);
  useShowWhenNear(group, room);
  return (
    <group ref={group} visible={false}>
      <Instances items={parts.walls} geometry={shared.box} material={shared.wallMaterial} occluder shadows />
      <Instances items={parts.floors} geometry={shared.plane} material={shared.floorMaterial} shadows />
      <Instances items={parts.ceilings} geometry={shared.plane} material={shared.ceilingMaterial} shadows />
      <Instances items={parts.rims} geometry={shared.box} material={shared.rimMaterial} />
      <Instances items={parts.panels} geometry={shared.box} material={shared.lampMaterial} />
    </group>
  );
}

export function Building({ plan }: { plan: FloorPlan }) {
  const parts = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    const plane = new PlaneGeometry(1, 1);
    return {
      box, plane,
      walls: wallInstances(plan),
      floors: floors(plan.rooms, (r) => floorY(r.level), -Math.PI / 2, (r) => tinted(TONES[r.type].floor, r, 0.08)),
      // The atrium draws its own ceiling, with the skylight.
      // Corridor ceilings are as high as the doorways, so they stop at the lintels instead of sharing their underside.
      ceilings: floors(plan.rooms.filter((r) => r.type !== "atrium"), (r) => floorY(r.level) + r.height, Math.PI / 2, (r) => TONES[r.type].ceiling, T),
      ...lampInstances(plan),
      wallMaterial: wallMaterial(),
      floorMaterial: floorMaterial(),
      ceilingMaterial: ceilingMaterial(),
      lampMaterial: lightMaterial(2.2),
      rimMaterial: steelMaterial(),
    };
  }, [plan]);

  // Physics: every wall, one floor under the whole ground level, and a floor for each upstairs room.
  const bounds = useMemo(() => {
    const xs = plan.rooms.flatMap((r) => [r.rect.x, r.rect.x + r.rect.w]);
    const zs = plan.rooms.flatMap((r) => [r.rect.y, r.rect.y + r.rect.d]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }, [plan]);
  const upstairs = plan.rooms.filter((r) => r.level > 0);
  const chunks = useMemo(() => {
    const by = new Map<number, Parts>(plan.rooms.map((r) => [r.id, { walls: [], floors: [], ceilings: [], rims: [], panels: [] }]));
    for (const k of ["walls", "floors", "ceilings", "rims", "panels"] as const) for (const it of parts[k]) by.get(it.room)![k].push(it);
    return [...by];
  }, [plan, parts]);

  return (
    <>
      {chunks.map(([room, p]) => <RoomChunk key={room} room={room} parts={p} shared={parts} />)}
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
