import { useEffect, useMemo, useState } from "react";
import { ATRIUM, LEVEL_HEIGHT, balconies } from "../../../shared/museum/atrium";
import { floorY, sameLevel, type FloorPlan, type Room } from "../../../shared/museum/generate";
import { requestTeleport } from "../engine/actions";
import { IsLocal, Look, Position, world } from "../engine/ecs";
import { settings } from "./settings";
import { ui } from "./store";
import { useCollectionNames } from "./names";

/** Where to put someone who picks a room on the map: its middle, or for the atrium a sensible spot. */
function arrival(room: Room, level: number) {
  if (room.type === "atrium") return level === 0 ? { x: ATRIUM.spawn.x, z: ATRIUM.spawn.z, yaw: 0 } : { x: 10, z: 0, yaw: Math.PI / 2 };
  return { x: room.rect.x + room.rect.w / 2, z: room.rect.y + room.rect.d / 2, yaw: 0 };
}

function go(room: Room, level: number) {
  const a = arrival(room, level);
  const move = () => requestTeleport({ ...a, y: floorY(level) });
  ui.set({ mapOpen: false, focused: null, seated: null });
  if (settings.get().reducedMotion) return move();
  ui.set({ fading: true });
  setTimeout(move, 220);
  setTimeout(() => ui.set({ fading: false }), 520);
}

/** A top-down map of one floor: wings in their theme colors, and where you are. Click a room to go there. */
export function MapView({ plan }: { plan: FloorPlan }) {
  const names = useCollectionNames();
  const [me, setMe] = useState({ x: 0, z: 0, yaw: 0, level: 0 });
  useEffect(() => {
    const read = () => {
      const e = world.queryFirst(IsLocal);
      const p = e?.get(Position), l = e?.get(Look);
      if (p && l) setMe({ x: p.x, z: p.z, yaw: l.yaw, level: p.y > LEVEL_HEIGHT / 2 ? 1 : 0 });
    };
    read();
    const id = setInterval(read, 200);
    return () => clearInterval(id);
  }, []);
  const [level, setLevel] = useState(me.level);
  useEffect(() => setLevel(me.level), [me.level]);

  const rooms = useMemo(() => plan.rooms.filter((r) => sameLevel(r, level)), [plan, level]);
  const box = useMemo(() => {
    const xs = rooms.flatMap((r) => [r.rect.x, r.rect.x + r.rect.w]), zs = rooms.flatMap((r) => [r.rect.y, r.rect.y + r.rect.d]);
    const pad = 3;
    return { x: Math.min(...xs) - pad, y: Math.min(...zs) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...zs) - Math.min(...zs) + pad * 2 };
  }, [rooms]);
  // Label each wing once, on its first gallery.
  const labels = useMemo(() => {
    const seen = new Set<string>();
    return rooms.filter((r) => r.type === "gallery" && r.wing && !seen.has(r.wing) && seen.add(r.wing));
  }, [rooms]);
  const font = Math.max(1.1, box.w / 55);

  return (
    <div className="map" role="dialog" aria-label="Map" onClick={() => ui.set({ mapOpen: false })}>
      <div className="map-card" onClick={(e) => e.stopPropagation()}>
        <div className="map-head">
          <strong>Map</strong>
          <div className="map-levels" role="tablist">
            {[1, 0].map((l) => (
              <button key={l} role="tab" aria-selected={level === l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>
                {l === 1 ? "Upstairs" : "Ground floor"}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <span className="muted small">Click a room to go there</span>
          <button aria-label="Close map" onClick={() => ui.set({ mapOpen: false })}>✕</button>
        </div>
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="map-svg">
          {rooms.map((r) => {
            const atrium = r.type === "atrium";
            const fill = atrium ? "#ffffff" : r.accent;
            return (
              <g key={r.id} className="map-room" onClick={() => go(r, level)}>
                <title>{atrium ? "Atrium" : r.type === "corridor" ? "Corridor" : names.get(r.wing ?? "") ?? "Gallery"}</title>
                <rect x={r.rect.x} y={r.rect.y} width={r.rect.w} height={r.rect.d}
                  fill={fill} fillOpacity={r.type === "corridor" ? 0.12 : atrium ? (level === 1 ? 0.04 : 0.1) : 0.22}
                  stroke={fill} strokeOpacity={0.7} strokeWidth={0.15} />
              </g>
            );
          })}
          {level === 1 && balconies().map((b, i) => (
            <rect key={i} x={b.x0} y={b.z0} width={b.x1 - b.x0} height={b.z1 - b.z0} fill="#ffffff" fillOpacity={0.12} pointerEvents="none" />
          ))}
          {level === 0 && (
            <rect x={ATRIUM.pool.x0} y={ATRIUM.pool.z0} width={ATRIUM.pool.x1 - ATRIUM.pool.x0} height={ATRIUM.pool.z1 - ATRIUM.pool.z0}
              fill="#4fb3c8" fillOpacity={0.35} pointerEvents="none" />
          )}
          <rect x={ATRIUM.stair.x0} y={ATRIUM.stair.z0} width={ATRIUM.stair.x1 - ATRIUM.stair.x0} height={ATRIUM.stair.z1 - ATRIUM.stair.z0}
            fill="#c8a477" fillOpacity={0.5} pointerEvents="none" />
          {labels.map((r) => (
            <text key={r.id} x={r.rect.x + r.rect.w / 2} y={r.rect.y + r.rect.d / 2} fontSize={font} textAnchor="middle" dominantBaseline="middle"
              fill="#ecebf2" pointerEvents="none">
              {r.wing === "main" ? names.get("main") ?? "Main hall" : names.get(r.wing!) ?? ""}
            </text>
          ))}
          {me.level === level && (
            <g transform={`translate(${me.x} ${me.z}) rotate(${(-me.yaw * 180) / Math.PI})`} pointerEvents="none">
              <circle r={font * 0.9} fill="#ffffff" fillOpacity={0.15} />
              <path d={`M 0 ${-font} L ${font * 0.6} ${font * 0.6} L 0 ${font * 0.25} L ${-font * 0.6} ${font * 0.6} Z`} fill="#ffffff" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
