import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, Color, EquirectangularReflectionMapping, Object3D, SRGBColorSpace, type PointLight, type SpotLight } from "three";
import { ATRIUM, LEVEL_HEIGHT } from "../../../shared/museum/atrium";
import { floorY, type FloorPlan } from "../../../shared/museum/generate";
import { useSettings } from "../ui/settings";

/**
 * Every light costs every lit pixel, whether it reaches it or not, so the budget is small:
 * low has the hemisphere, the skylight sun and one room light; high adds two more room lights and
 * two fills under the balconies.
 */
const ROOM_LIGHTS = { low: 1, high: 3 } as const;

/**
 * A soft studio environment for reflections: a dark room with a bright skylight overhead and a few
 * pale panels, so polished floors, water and metal have something to mirror.
 */
function useEnvironment() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    const g = c.getContext("2d")!;
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, "#e9eef5"); sky.addColorStop(0.18, "#7d8590"); sky.addColorStop(0.5, "#202226"); sky.addColorStop(1, "#08080a");
    g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
    g.fillStyle = "rgba(255,244,228,0.5)";
    for (let i = 0; i < 6; i++) g.fillRect(i * 86 + 20, 92, 40, 30);
    const tex = new CanvasTexture(c);
    tex.mapping = EquirectangularReflectionMapping;
    tex.colorSpace = SRGBColorSpace;
    scene.environment = tex;
    scene.environmentIntensity = 0.35;
    return () => {
      scene.environment = null;
      tex.dispose();
    };
  }, [scene]);
}

export function Lighting({ plan }: { plan: FloorPlan }) {
  useEnvironment();
  const { quality } = useSettings();
  const shadows = quality === "high";
  const roomLights = ROOM_LIGHTS[quality];
  const sun = useRef<SpotLight>(null);
  const target = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.target = target;
    // Nothing that casts a shadow moves, so the shadow map is drawn once (again once props and art
    // have settled) instead of every frame.
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    const again = setTimeout(() => void (light.shadow.needsUpdate = true), 3000);
    return () => clearTimeout(again);
  }, [target]);

  // Gallery lights go to the rooms nearest the camera, a few times a second.
  const camera = useThree((s) => s.camera);
  const pool = useRef<(PointLight | null)[]>([]);
  const galleries = useMemo(() => plan.rooms.filter((r) => r.type === "gallery"), [plan]);
  const warm = useMemo(() => new Color("#ffe9d2"), []);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.25) return;
    last.current = clock.elapsedTime;
    const { x, y, z } = camera.position;
    const level = y > LEVEL_HEIGHT - 0.5 ? 1 : 0;
    const nearest = galleries
      .map((r) => ({ r, d: Math.hypot(r.rect.x + r.rect.w / 2 - x, r.rect.y + r.rect.d / 2 - z) + (r.level === level ? 0 : 30) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, roomLights);
    pool.current.forEach((light, i) => {
      if (!light) return;
      const room = nearest[i]?.r;
      if (!room) { light.intensity = 0; return; }
      light.position.set(room.rect.x + room.rect.w / 2, floorY(room.level) + room.height - 1.5, room.rect.y + room.rect.d / 2);
      light.color.copy(warm).lerp(new Color(room.accent), 0.18);
      light.distance = Math.max(room.rect.w, room.rect.d) * 1.5;
      light.intensity = 65;
    });
  });

  const { rect } = ATRIUM;
  return (
    <>
      {/* Brighter sky light makes up for the lights low quality goes without. */}
      <hemisphereLight args={["#c6cad6", "#0b0b0e", quality === "high" ? 0.9 : 1.4]} />
      {/* The sun through the skylight, the only light that casts shadows. */}
      <spotLight
        ref={sun}
        position={[0, ATRIUM.height + 6, -1]}
        angle={0.6}
        penumbra={0.5}
        intensity={2400}
        distance={42}
        decay={2}
        color="#fff3e2"
        castShadow={shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={4}
        shadow-camera-far={40}
      />
      <primitive object={target} position={[0, 0, 0]} />
      {/* Warm light pooling under the east and west balconies, on the ground-floor hero walls. */}
      {quality === "high" && [[rect.x + 2, 4.6, 0], [rect.x + rect.w - 2, 4.6, 0]].map(([px, py, pz], i) => (
        <pointLight key={i} position={[px, py, pz]} intensity={30} distance={14} decay={2} color="#ffdcb4" />
      ))}
      {Array.from({ length: roomLights }, (_, i) => (
        <pointLight key={`room${i}`} ref={(l) => void (pool.current[i] = l)} intensity={0} decay={2} />
      ))}
    </>
  );
}
