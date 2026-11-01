import { useSyncExternalStore } from "react";
import type { Collection } from "../../../shared/museum/manifest";

/** Collection names by id, for the map and anything else outside the 3D scene. Set once the manifest loads. */
let names = new Map<string, string>();
const listeners = new Set<() => void>();

export function setCollections(list: Collection[]) {
  names = new Map(list.map((c) => [c.id, c.name]));
  listeners.forEach((l) => l());
}

export const useCollectionNames = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => names);
