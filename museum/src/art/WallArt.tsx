import { useEffect, useMemo, useState } from "react";
import type { Texture } from "three";
import type { WallSlot } from "../../../shared/museum/generate";
import type { Exhibit } from "../../../shared/museum/manifest";
import { acquireArt, releaseArt } from "./textures";
import { live, useLive } from "./live";
import { useNearby } from "../world/nearby";
import { plaqueLayout, plaqueTexture } from "./plaque";
import { useUi } from "../ui/store";
import { haloMaterial } from "../world/materials";

/**
 * A 2D work floating a few centimeters off its wall. Unlit, so the art is the brightest thing in the
 * room. Shows the live sketch when one is running for it, the image otherwise; draws nothing at all
 * when its room is far away.
 */
export function WallArt({ exhibit, slot, accent }: { exhibit: Exhibit; slot: WallSlot; accent: string }) {
  const focused = useUi((s) => s.focused === exhibit.id);
  const near = useNearby(slot.room);
  return near || focused ? <ShownArt exhibit={exhibit} slot={slot} accent={accent} focused={focused} /> : null;
}

function ShownArt({ exhibit, slot, accent, focused }: { exhibit: Exhibit; slot: WallSlot; accent: string; focused: boolean }) {
  const halo = useMemo(() => haloMaterial(accent), [accent]);
  useEffect(() => () => halo.dispose(), [halo]);
  const [texture, setTexture] = useState<Texture | null>(null);
  useLive();
  const liveTexture = live.texture(exhibit.id);

  useEffect(() => {
    let mounted = true;
    const url = exhibit.images["1k"];
    void acquireArt(url).then((t) => mounted && setTexture((cur) => cur ?? t));
    return () => {
      mounted = false;
      releaseArt(url);
    };
  }, [exhibit.images]);

  // The sharper copy once someone looks closely.
  useEffect(() => {
    if (!focused) return;
    let mounted = true;
    const url = exhibit.images["2k"];
    void acquireArt(url).then((t) => mounted && setTexture(t));
    return () => {
      mounted = false;
      releaseArt(url);
    };
  }, [focused, exhibit.images]);

  const shown = liveTexture ?? texture;
  const rerolled = live.rerolled(exhibit.id);
  const plaque = useMemo(() => plaqueTexture(exhibit, rerolled), [exhibit, rerolled]);
  useEffect(() => () => plaque.dispose(), [plaque]);
  const label = plaqueLayout(slot);
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
      {/* The plaque, with a thin backing so it stands off the wall. */}
      <mesh position={[label.x, label.y, -0.03]} userData={{ exhibitId: exhibit.id }}>
        <boxGeometry args={[label.w + 0.01, label.h + 0.01, 0.012]} />
        <meshStandardMaterial color="#0c0c0f" roughness={0.5} />
      </mesh>
      <mesh position={[label.x, label.y, -0.023]}>
        <planeGeometry args={[label.w, label.h]} />
        <meshBasicMaterial key={plaque.uuid} map={plaque} color="#d8d8d8" toneMapped={false} />
      </mesh>
      <mesh userData={{ exhibitId: exhibit.id }}>
        <planeGeometry args={[slot.w, slot.h]} />
        {/*
          A new material per texture: WebGPU materials are compiled for the maps they have, and R3F
          would reset a dropped prop (like color) to black if one element switched between the two.
        */}
        <meshBasicMaterial key={shown?.uuid ?? "empty"} map={shown} color={shown ? "#ffffff" : "#15151b"} toneMapped={false} />
      </mesh>
    </group>
  );
}
