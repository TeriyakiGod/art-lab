import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { PCFShadowMap, WebGPURenderer } from "three/webgpu";
import { Fog, type WebGLRenderer } from "three";
import type { FloorPlan } from "../../../shared/museum/generate";
import type { Exhibit } from "../../../shared/museum/manifest";
import { seatsOf, type Prop } from "../../../shared/museum/props";
import { Building } from "./Building";
import { Atrium } from "./Atrium";
import { Lighting } from "./Lighting";
import { Effects } from "./Effects";
import { Props } from "../props/Props";
import { Player } from "../engine/Player";
import { attachInput, clearInput } from "../engine/input";
import { setMuseumCanvas } from "../engine/pointer";
import { DISPLAYS } from "../art/registry";
import { LocalAdapter } from "../net/NetAdapter";
import { ui } from "../ui/store";
import { useSettings } from "../ui/settings";

const BACKGROUND = "#060608";

type Props_ = { plan: FloorPlan; props: Prop[]; exhibits: Map<string, Exhibit>; start: { x: number; y: number; z: number; yaw: number } };

/** Captures the mouse when the canvas is clicked, and mirrors pointer lock into the UI state. */
function PointerLock() {
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => {
    const detach = attachInput(canvas);
    const onClick = () => {
      const { focused, hovered, hoveredSeat } = ui.get();
      if (focused) return;
      if (document.pointerLockElement === canvas && hovered) {
        ui.set({ focused: hovered });
        void document.exitPointerLock();
      } else if (document.pointerLockElement === canvas && hoveredSeat !== null) {
        ui.set({ seated: hoveredSeat });
      } else if (document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock();
      }
    };
    const onChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked) clearInput();
      ui.set({ walking: locked });
    };
    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onChange);
    setMuseumCanvas(canvas);
    return () => {
      setMuseumCanvas(null);
      detach();
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onChange);
    };
  }, [canvas]);
  return null;
}

export default function Museum({ plan, props, exhibits, start }: Props_) {
  const net = useMemo(() => new LocalAdapter(), []);
  const fog = useMemo(() => new Fog(BACKGROUND, 26, 90), []);
  const benches = useMemo(() => seatsOf(props), [props]);
  const accents = useMemo(() => new Map(plan.slots.map((s) => [s.exhibitId, plan.rooms[s.room].accent])), [plan]);
  const { quality } = useSettings();

  return (
    <Canvas
      // Remounted when quality changes: shadow support is baked into every material.
      key={quality}
      camera={{ fov: 70, near: 0.05, far: 200 }}
      dpr={quality === "high" ? [1, 2] : 1}
      // WebGPU where the browser has it; three falls back to WebGL2 by itself.
      gl={async (glProps) => {
        const renderer = new WebGPURenderer({ ...(glProps as object), antialias: quality === "high" });
        renderer.shadowMap.enabled = quality === "high";
        renderer.shadowMap.type = PCFShadowMap;
        await renderer.init();
        return renderer as unknown as WebGLRenderer;
      }}
      scene={{ fog }}
      onCreated={(state) => {
        if (import.meta.env.DEV) Object.assign((window as unknown as { __museum: object }).__museum, { r3f: state });
      }}
      style={{ background: BACKGROUND }}
    >
      <color attach="background" args={[BACKGROUND]} />
      <Lighting plan={plan} />
      <PointerLock />
      <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]}>
        <Building plan={plan} />
        <Atrium />
        <Props props={props} />
        <Player plan={plan} benches={benches} net={net} start={start} />
      </Physics>
      {plan.slots.map((slot) => {
        const exhibit = exhibits.get(slot.exhibitId);
        if (!exhibit) return null;
        const Display = DISPLAYS[exhibit.medium];
        return <Display key={slot.exhibitId} exhibit={exhibit} slot={slot} accent={accents.get(slot.exhibitId)!} />;
      })}
      <Effects />
    </Canvas>
  );
}
