import { useEffect, useMemo, useState } from "react";
import type { Texture } from "three";
import type { WallSlot } from "../../../shared/museum/generate";
import type { Exhibit } from "../../../shared/museum/manifest";
import { loadArt } from "./textures";
import { useUi } from "../ui/store";
import { haloMaterial } from "../world/materials";

/** A 2D work floating a few centimeters off its wall. Unlit, so the art is the brightest thing in the room. */
export function WallArt({ exhibit, slot, accent }: { exhibit: Exhibit; slot: WallSlot; accent: string }) {
  const halo = useMemo(() => haloMaterial(accent), [accent]);
  const focused = useUi((s) => s.focused === exhibit.id);
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let live = true;
    void loadArt(exhibit.images["1k"]).then((t) => live && setTexture((cur) => cur ?? t));
    return () => void (live = false);
  }, [exhibit.images]);

  // The sharper copy once someone looks closely.
  useEffect(() => {
    if (!focused) return;
    let live = true;
    void loadArt(exhibit.images["2k"]).then((t) => live && setTexture(t));
    return () => void (live = false);
  }, [focused, exhibit.images]);

  return (
    <group position={[slot.x, slot.y, slot.z]} rotation={[0, Math.atan2(slot.nx, slot.nz), 0]}>
      {/* A soft glow of the room's accent on the wall behind it. */}
      <mesh position={[0, 0, -0.035]} material={halo}>
        <planeGeometry args={[slot.w + 1.4, slot.h + 1.4]} />
      </mesh>
      {/* A dark mount just behind the work. */}
      <mesh position={[0, 0, -0.025]}>
        <boxGeometry args={[slot.w + 0.04, slot.h + 0.04, 0.03]} />
        <meshStandardMaterial color="#050507" roughness={0.6} />
      </mesh>
      <mesh userData={{ exhibitId: exhibit.id }}>
        <planeGeometry args={[slot.w, slot.h]} />
        {/*
          A new material per texture: WebGPU materials are compiled for the maps they have, and R3F
          would reset a dropped prop (like color) to black if one element switched between the two.
        */}
        <meshBasicMaterial key={texture?.uuid ?? "empty"} map={texture} color={texture ? "#ffffff" : "#15151b"} toneMapped={false} />
      </mesh>
    </group>
  );
}
