import { useSyncExternalStore } from "react";

/** UI state shared between the 3D scene and the HTML overlay. */
export type UiState = {
  /** Walking with the mouse captured; false shows the start/pause screen. */
  walking: boolean;
  /** The work under the crosshair, close enough to read. */
  hovered: string | null;
  /** The work being viewed up close; movement stops while set. */
  focused: string | null;
  /** The bench under the crosshair, close enough to sit on (index into the benches). */
  hoveredSeat: number | null;
  /** The bench being sat on. */
  seated: number | null;
};

let state: UiState = { walking: false, hovered: null, focused: null, hoveredSeat: null, seated: null };
const listeners = new Set<() => void>();

export const ui = {
  get: () => state,
  set(patch: Partial<UiState>) {
    const next = { ...state, ...patch };
    if ((Object.keys(patch) as (keyof UiState)[]).every((k) => next[k] === state[k])) return;
    state = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

export const useUi = <T,>(pick: (s: UiState) => T) => useSyncExternalStore(ui.subscribe, () => pick(state));
