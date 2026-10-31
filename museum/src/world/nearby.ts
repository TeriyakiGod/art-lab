import { useEffect, useSyncExternalStore } from "react";

/** Rooms close enough (through doorways) to draw their art. Updated a few times a second by the Director. */
let rooms = new Set<number>();
const listeners = new Set<() => void>();

export const nearby = {
  set(next: Set<number>) {
    if (next.size === rooms.size && [...next].every((r) => rooms.has(r))) return;
    rooms = next;
    listeners.forEach((l) => l());
  },
  has: (room: number) => rooms.has(room),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

export const useNearby = (room: number) => useSyncExternalStore(nearby.subscribe, () => rooms.has(room));

/** Shows an object only while its room is near, without re-rendering React. */
export function useShowWhenNear(ref: { current: { visible: boolean } | null }, room: number) {
  useEffect(() => {
    const update = () => {
      if (ref.current) ref.current.visible = rooms.has(room);
    };
    update();
    return nearby.subscribe(update);
  }, [ref, room]);
}
