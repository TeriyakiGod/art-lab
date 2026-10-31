import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Keeps frames smooth on whatever GPU this is: renders fewer pixels when frames run long, more when
 * there's headroom. Changes are spaced out so the image doesn't pump.
 */
export function AdaptiveResolution({ min, max }: { min: number; max: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const dpr = useRef(max);
  const acc = useRef({ time: 0, frames: 0, sinceChange: 0 });

  useFrame((_, delta) => {
    const a = acc.current;
    // Ignore hitches like tab switches or shader compiles.
    if (delta > 0.25) return;
    a.time += delta;
    a.frames++;
    a.sinceChange += delta;
    if (a.time < 1) return;
    const avg = a.time / a.frames;
    a.time = 0;
    a.frames = 0;
    if (a.sinceChange < 2) return;
    let next = dpr.current;
    if (avg > 1 / 45) next = Math.max(min, dpr.current * (avg > 1 / 25 ? 0.75 : 0.88));
    else if (avg < 1 / 58) next = Math.min(max, dpr.current * 1.1);
    if (Math.abs(next - dpr.current) > 0.02) {
      dpr.current = next;
      a.sinceChange = 0;
      setDpr(next);
    }
  });
  return null;
}
