import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { WebGPURenderer } from "three/webgpu";
import { Fog, type WebGLRenderer } from "three";
import type { FloorPlan } from "../../../shared/museum/generate";
import type { Exhibit } from "../../../shared/museum/manifest";
import { Building } from "./Building";
import { Player } from "../engine/Player";
import { attachInput, clearInput } from "../engine/input";
import { setMuseumCanvas } from "../engine/pointer";
import { DISPLAYS } from "../art/registry";
import { LocalAdapter } from "../net/NetAdapter";
import { ui } from "../ui/store";

const BACKGROUND = "#060608";

type Props = { plan: FloorPlan; exhibits: Map<string, Exhibit>; start: { x: number; z: number; yaw: number } };

/** Captures the mouse when the canvas is clicked, and mirrors pointer lock into the UI state. */
function PointerLock() {
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => {
    const detach = attachInput(canvas);
    const onClick = () => {
      const { focused, hovered } = ui.get();
      if (focused) return;
      if (document.pointerLockElement === canvas && hovered) {
        ui.set({ focused: hovered });
        void document.exitPointerLock();
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

export default function Museum({ plan, exhibits, start }: Props) {
  const net = useMemo(() => new LocalAdapter(), []);
  const fog = useMemo(() => new Fog(BACKGROUND, 18, 70), []);
  return (
    <Canvas
      camera={{ fov: 70, near: 0.05, far: 200 }}
      // WebGPU where the browser has it; three falls back to WebGL2 by itself.
      gl={async (props) => {
        const renderer = new WebGPURenderer({ ...(props as object), antialias: true });
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
      <hemisphereLight args={["#b8bccc", "#0a0a0d", 4.5]} />
      <directionalLight position={[8, 20, 5]} intensity={2.5} />
      <PointerLock />
      <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]}>
        <Building plan={plan} />
        <Player plan={plan} net={net} start={start} />
      </Physics>
      {plan.slots.map((slot) => {
        const exhibit = exhibits.get(slot.exhibitId);
        if (!exhibit) return null;
        const Display = DISPLAYS[exhibit.medium];
        return <Display key={slot.exhibitId} exhibit={exhibit} slot={slot} />;
      })}
    </Canvas>
  );
}
