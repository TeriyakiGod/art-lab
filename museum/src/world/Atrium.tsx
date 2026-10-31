import { useMemo } from "react";
import { BoxGeometry, PlaneGeometry } from "three";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { ATRIUM, LEVEL_HEIGHT, balconies, railings } from "../../../shared/museum/atrium";
import {
  ceilingMaterial, concreteMaterial, floorMaterial, foamMaterial, glassMaterial, lightMaterial, skylightMaterial,
  steelMaterial, stoneMaterial, waterSurfaceMaterial, waterfallMaterial, woodMaterial,
} from "./materials";

const { rect, height, slab, pool, waterWall, stair } = ATRIUM;
const RAIL_HEIGHT = 1.05;

/** A box from its min/max corners, so the layout below reads like a plan. */
function Box({ x0, x1, y0, y1, z0, z1, material, cast = true, receive = true }: {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
  material: object; cast?: boolean; receive?: boolean;
}) {
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} castShadow={cast} receiveShadow={receive} material={material as never}>
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
    </mesh>
  );
}

/** The handcrafted heart of the museum. Wings attach to its ports; this draws everything inside. */
export function Atrium() {
  const m = useMemo(() => ({
    ceiling: ceilingMaterial(), skylight: skylightMaterial(), concrete: concreteMaterial(), floor: floorMaterial("#5c5852"),
    glass: glassMaterial(), steel: steelMaterial(), stone: stoneMaterial(), wood: woodMaterial(),
    light: lightMaterial(2.6), softLight: lightMaterial(1.4), water: waterSurfaceMaterial(waterWall.z),
    fall: waterfallMaterial(), foam: foamMaterial(), wetStone: concreteMaterial("#15181a"),
  }), []);

  const rails = useMemo(railings, []);
  const decks = useMemo(balconies, []);
  const stairRun = stair.z1 - stair.z0, rise = LEVEL_HEIGHT / stair.steps, run = stairRun / stair.steps;
  const stairAngle = Math.atan2(LEVEL_HEIGHT, stairRun);
  const stairLength = Math.hypot(LEVEL_HEIGHT, stairRun);
  const planes = useMemo(() => ({ plane: new PlaneGeometry(1, 1), box: new BoxGeometry(1, 1, 1) }), []);

  const x0 = rect.x, x1 = rect.x + rect.w, z0 = rect.y, z1 = rect.y + rect.d, b = ATRIUM.balconyDepth;

  return (
    <group>
      {/* Ceiling with a skylight over the open middle. */}
      <mesh position={[0, height, (z0 + z1 - b) / 2]} rotation={[Math.PI / 2, 0, 0]} material={m.skylight}>
        <planeGeometry args={[x1 - x0 - 2 * b, z1 - z0 - b]} />
      </mesh>
      {[[x0, x0 + b, z0, z1], [x1 - b, x1, z0, z1], [x0 + b, x1 - b, z1 - b, z1]].map(([a, c, d, e], i) => (
        <mesh key={i} position={[(a + c) / 2, height - 0.01, (d + e) / 2]} rotation={[Math.PI / 2, 0, 0]} material={m.ceiling}>
          <planeGeometry args={[c - a, e - d]} />
        </mesh>
      ))}

      {/* Balconies: pale slabs with a line of light under the open edge, terrazzo on top. */}
      {decks.map((d, i) => (
        <group key={i}>
          <Box x0={d.x0} x1={d.x1} y0={LEVEL_HEIGHT - slab} y1={LEVEL_HEIGHT - 0.005} z0={d.z0} z1={d.z1} material={m.concrete} />
          <mesh position={[(d.x0 + d.x1) / 2, LEVEL_HEIGHT, (d.z0 + d.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={m.floor} receiveShadow>
            <planeGeometry args={[d.x1 - d.x0, d.z1 - d.z0]} />
          </mesh>
        </group>
      ))}
      {rails.map((r, i) => {
        const alongX = r.z1 === r.z2;
        const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
        const mx = (r.x1 + r.x2) / 2, mz = (r.z1 + r.z2) / 2;
        const size = (t: number, h: number): [number, number, number] => (alongX ? [len, h, t] : [t, h, len]);
        const under: [number, number, number] = alongX ? [mx, LEVEL_HEIGHT - slab - 0.02, mz - 0.06 * Math.sign(mz)] : [mx - 0.06 * Math.sign(mx), LEVEL_HEIGHT - slab - 0.02, mz];
        return (
          <group key={i}>
            <mesh position={[mx, LEVEL_HEIGHT + RAIL_HEIGHT / 2, mz]} material={m.glass} geometry={planes.box} scale={size(0.02, RAIL_HEIGHT)} />
            <mesh position={[mx, LEVEL_HEIGHT + RAIL_HEIGHT, mz]} material={m.steel} geometry={planes.box} scale={size(0.06, 0.04)} castShadow />
            <mesh position={under} material={m.light} geometry={planes.box} scale={size(0.03, 0.03)} />
          </group>
        );
      })}

      {/* Floating stair: open oak treads on a single concrete spine, lit from beneath. */}
      {Array.from({ length: stair.steps }, (_, i) => (
        <Box key={i} x0={stair.x0} x1={stair.x1} y0={(i + 1) * rise - 0.07} y1={(i + 1) * rise} z0={stair.z0 + i * run - 0.02} z1={stair.z0 + (i + 1) * run + 0.02} material={m.wood} />
      ))}
      <mesh position={[0, LEVEL_HEIGHT / 2 - 0.22, (stair.z0 + stair.z1) / 2]} rotation={[-stairAngle, 0, 0]} material={m.steel} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.3, stairLength]} />
      </mesh>
      <mesh position={[0, LEVEL_HEIGHT / 2 - 0.38, (stair.z0 + stair.z1) / 2]} rotation={[-stairAngle, 0, 0]} material={m.light}>
        <boxGeometry args={[0.5, 0.02, stairLength]} />
      </mesh>
      {[stair.x0 - 0.03, stair.x1 + 0.03].map((x) => (
        <group key={x} position={[x, LEVEL_HEIGHT / 2, (stair.z0 + stair.z1) / 2]} rotation={[-stairAngle, 0, 0]}>
          <mesh position={[0, RAIL_HEIGHT / 2, 0]} material={m.glass}>
            <boxGeometry args={[0.02, RAIL_HEIGHT, stairLength]} />
          </mesh>
          <mesh position={[0, RAIL_HEIGHT, 0]} material={m.steel} castShadow>
            <boxGeometry args={[0.05, 0.04, stairLength]} />
          </mesh>
        </group>
      ))}

      {/* Water wall: a sheet falling the full height into the pool, from a glowing slot at the top. */}
      <Box x0={waterWall.x0 - 0.3} x1={waterWall.x1 + 0.3} y0={0} y1={height} z0={waterWall.z} z1={waterWall.z + 0.12} material={m.wetStone} cast={false} />
      <mesh position={[0, (pool.water + waterWall.top) / 2, waterWall.z + 0.15]} material={m.fall}>
        <planeGeometry args={[waterWall.x1 - waterWall.x0, waterWall.top - pool.water]} />
      </mesh>
      <Box x0={waterWall.x0} x1={waterWall.x1} y0={waterWall.top} y1={waterWall.top + 0.06} z0={waterWall.z + 0.1} z1={waterWall.z + 0.3} material={m.light} cast={false} />

      {/* Reflecting pool with a travertine rim. */}
      <Box x0={pool.x0 - 0.35} x1={pool.x0} y0={0} y1={pool.rim} z0={pool.z0} z1={pool.z1 + 0.35} material={m.stone} />
      <Box x0={pool.x1} x1={pool.x1 + 0.35} y0={0} y1={pool.rim} z0={pool.z0} z1={pool.z1 + 0.35} material={m.stone} />
      <Box x0={pool.x0} x1={pool.x1} y0={0} y1={pool.rim} z0={pool.z1} z1={pool.z1 + 0.35} material={m.stone} />
      <mesh position={[(pool.x0 + pool.x1) / 2, pool.water, (pool.z0 + pool.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={m.water} receiveShadow>
        <planeGeometry args={[pool.x1 - pool.x0, pool.z1 - pool.z0, 1, 1]} />
      </mesh>
      <mesh position={[0, pool.water + 0.01, waterWall.z + 0.9]} rotation={[-Math.PI / 2, 0, 0]} material={m.foam}>
        <planeGeometry args={[waterWall.x1 - waterWall.x0 + 0.4, 1.6]} />
      </mesh>
      <mesh position={[(pool.x0 + pool.x1) / 2, pool.rim - 0.03, pool.z1 + 0.37]} material={m.softLight}>
        <boxGeometry args={[pool.x1 - pool.x0 + 0.7, 0.02, 0.02]} />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        {decks.map((d, i) => (
          <CuboidCollider key={`d${i}`} args={[(d.x1 - d.x0) / 2, slab / 2, (d.z1 - d.z0) / 2]} position={[(d.x0 + d.x1) / 2, LEVEL_HEIGHT - slab / 2, (d.z0 + d.z1) / 2]} />
        ))}
        {rails.map((r, i) => {
          const alongX = r.z1 === r.z2;
          const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
          return (
            <CuboidCollider key={`r${i}`} args={alongX ? [len / 2, 0.6, 0.05] : [0.05, 0.6, len / 2]} position={[(r.x1 + r.x2) / 2, LEVEL_HEIGHT + 0.6, (r.z1 + r.z2) / 2]} />
          );
        })}
        {/* The stair is a smooth ramp to walk on; the treads are just for looks. */}
        <CuboidCollider
          args={[(stair.x1 - stair.x0) / 2, 0.1, stairLength / 2]}
          position={[0, LEVEL_HEIGHT / 2 + 0.03, (stair.z0 + stair.z1) / 2]}
          rotation={[-stairAngle, 0, 0]}
        />
        {/* Glass guards along both sides of the stair, all the way up. */}
        {[stair.x0 - 0.05, stair.x1 + 0.05].map((x) => (
          <CuboidCollider key={x} args={[0.05, 0.7, stairLength / 2]} position={[x, LEVEL_HEIGHT / 2 + 0.7, (stair.z0 + stair.z1) / 2]} rotation={[-stairAngle, 0, 0]} />
        ))}
        {/* Pool rim, high enough that it can't be stepped over. */}
        <CuboidCollider args={[(pool.x1 - pool.x0) / 2 + 0.35, 0.5, (pool.z1 - pool.z0) / 2 + 0.17]} position={[(pool.x0 + pool.x1) / 2, 0.5, (pool.z0 + pool.z1 + 0.35) / 2]} />
      </RigidBody>
    </group>
  );
}
