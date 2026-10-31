import { useSyncExternalStore } from "react";

/** Per-visitor preferences, remembered in this browser. */
export type Settings = {
  /** high: shadows and ambient occlusion; low: neither, for phones and older GPUs. */
  quality: "high" | "low";
  sound: boolean;
};

const KEY = "museum:settings";

function load(): Settings {
  const fallback: Settings = { quality: matchMedia("(pointer: coarse)").matches ? "low" : "high", sound: false };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

let state = load();
const listeners = new Set<() => void>();

export const settings = {
  get: () => state,
  set(patch: Partial<Settings>) {
    state = { ...state, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

export const useSettings = () => useSyncExternalStore(settings.subscribe, () => state);
