import { useSyncExternalStore } from "react";
import type { Texture } from "three";

/**
 * Live art state: which works are running, the latest frame of each, and each visitor's re-rolled
 * seeds. The runners themselves (sandboxed iframes, three.js textures) are in runner.ts, which only
 * loads with the 3D scene; this file stays small so the start screen can use it.
 */

export type Status = "loading" | "running" | "error";
/** What a running sketch looks like from here; implemented by runner.ts. */
export type RunnerHandle = { seed: string; stop(keepFrame: boolean): void };

const textures = new Map<string, Texture>();
const statuses = new Map<string, Status>();
const rerolls = new Map<string, string>();
const failedAt = new Map<string, number>();
const runners = new Map<string, RunnerHandle>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/** Shared with runner.ts. */
export const liveState = { textures, statuses, failedAt, runners, emit };

export const live = {
  /** The seed a work is shown with: the visitor's re-roll, or `original`. */
  seedOf(id: string, original = ""): string {
    return rerolls.get(id) ?? original;
  },
  reroll(id: string, seed = Math.random().toString(36).slice(2, 10)) {
    rerolls.set(id, seed);
    statuses.delete(id);
    // Restart with the new seed right away; the scene keeps it wanted.
    runners.get(id)?.stop(true);
    runners.delete(id);
    emit();
    return seed;
  },
  original(id: string) {
    rerolls.delete(id);
    runners.get(id)?.stop(false);
    runners.delete(id);
    textures.get(id)?.dispose();
    textures.delete(id);
    statuses.delete(id);
    emit();
  },
  rerolled: (id: string) => rerolls.get(id),
  texture: (id: string) => textures.get(id),
  status: (id: string) => statuses.get(id),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

/** Re-renders when anything live changes; read values with `live.*` inside. */
export const useLive = () => useSyncExternalStore(live.subscribe, () => version);
