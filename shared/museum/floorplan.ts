import type { FloorPlan, Room } from "./generate";

/** Queries on a generated floor plan, shared by the museum client and (later) the multiplayer server. */

/** The room containing a world point, if any. Rooms never overlap, so there's at most one. */
export function roomAt(plan: FloorPlan, x: number, z: number): Room | undefined {
  return plan.rooms.find(({ rect: r }) => x >= r.x && x <= r.x + r.w && z >= r.y && z <= r.y + r.d);
}

/** Whether a body of `radius` can stand at (x, z): inside a room, clear of its walls. */
export function isWalkable(plan: FloorPlan, x: number, z: number, radius = 0.3): boolean {
  const room = roomAt(plan, x, z);
  if (!room) return false;
  const r = room.rect;
  const inner = x >= r.x + radius && x <= r.x + r.w - radius && z >= r.y + radius && z <= r.y + r.d - radius;
  // Near a room's edge only counts where a doorway leads on into the next room.
  return inner || plan.doors.some((d) => distanceToSegment(x, z, d.x1, d.z1, d.x2, d.z2) < radius + 0.01);
}

export function distanceToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

/** Rooms adjacent through a doorway. */
export function neighbors(plan: FloorPlan, room: number): number[] {
  return plan.doors.flatMap((d) => (d.from === room ? [d.to] : d.to === room ? [d.from] : []));
}

/** Where to stand to look at a work: in front of it, far enough to see it whole. */
export function viewpoint(slot: { x: number; z: number; nx: number; nz: number; w: number; h: number }) {
  const distance = Math.min(6, Math.max(1.6, Math.max(slot.w, slot.h) * 1.3));
  return { x: slot.x + slot.nx * distance, z: slot.z + slot.nz * distance, yaw: Math.atan2(slot.nx, slot.nz), distance };
}
