import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { LEVEL_HEIGHT } from "../../../shared/museum/atrium";
import type { FloorPlan } from "../../../shared/museum/generate";
import { neighbors, roomAt } from "../../../shared/museum/floorplan";
import type { Exhibit } from "../../../shared/museum/manifest";
import { live, type Wanted } from "../art/live";
import { nearby } from "./nearby";
import { ui } from "../ui/store";
import { useSettings } from "../ui/settings";

/** Doorways to walk through from the current room when deciding what to draw (corridors count). */
const DRAW_DEPTH = 3;
/** Animated works start running live within this distance, if you're facing them. */
const LIVE_RANGE = 4.5;
const MAX_LIVE = { low: 1, high: 2 } as const;

/**
 * A few times a second: which rooms are near enough to draw their art, and which works run live
 * (the one you're looking at closely, then animated works right in front of you).
 */
export function Director({ plan, exhibits }: { plan: FloorPlan; exhibits: Map<string, Exhibit> }) {
  const camera = useThree((s) => s.camera);
  const { quality } = useSettings();
  const last = useRef(-1);
  const dir = useMemo(() => new Vector3(), []);

  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.25) return;
    last.current = clock.elapsedTime;
    const { x, y, z } = camera.position;
    const level = y > LEVEL_HEIGHT - 0.5 ? 1 : 0;
    const here = roomAt(plan, x, z, level)?.id;

    // Rooms within a few doorways.
    if (here !== undefined) {
      const near = new Set([here]);
      let frontier = [here];
      for (let d = 0; d < DRAW_DEPTH; d++) {
        frontier = frontier.flatMap((r) => neighbors(plan, r)).filter((r) => !near.has(r));
        frontier.forEach((r) => near.add(r));
      }
      nearby.set(near);
    }

    // Live works.
    const { focused } = ui.get();
    const wanted: Wanted[] = [];
    const focusedWork = focused ? exhibits.get(focused) : undefined;
    if (focusedWork?.live && (focusedWork.animated || live.rerolled(focusedWork.id))) {
      wanted.push({ id: focusedWork.id, animated: focusedWork.animated, seed: focusedWork.seed });
    }
    camera.getWorldDirection(dir);
    const close = plan.slots
      .filter((s) => s.exhibitId !== focused && s.room === here)
      .map((s) => ({ s, d: Math.hypot(s.x - x, s.y - y, s.z - z) }))
      .filter(({ s, d }) => {
        if (d > LIVE_RANGE) return false;
        const facing = ((s.x - x) * dir.x + (s.y - y) * dir.y + (s.z - z) * dir.z) / d;
        return facing > 0.3 && (x - s.x) * s.nx + (z - s.z) * s.nz > 0;
      })
      .sort((a, b) => a.d - b.d);
    for (const { s } of close) {
      const e = exhibits.get(s.exhibitId);
      if (e?.live && e.animated) wanted.push({ id: e.id, animated: true, seed: e.seed });
    }
    live.setWanted(wanted.slice(0, MAX_LIVE[quality]));
  });
  return null;
}
