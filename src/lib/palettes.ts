import { createStore, del, entries, get, set } from "idb-keyval";
import type { Palette } from "../../shared/types";
import { api, json } from "./api";

// Saved palettes follow the same local-first pattern as sketches (see store.ts).
const palettes = createStore("art-lab-palettes", "palettes");
const meta = createStore("art-lab-palettes-meta", "meta");

type Listener = () => void;
const listeners = new Set<Listener>();
export const subscribePalettes = (l: Listener) => (listeners.add(l), () => void listeners.delete(l));
const emit = () => listeners.forEach((l) => l());

export async function listPalettes(): Promise<Palette[]> {
  const all = await entries<string, Palette>(palettes);
  return all.map(([, p]) => p).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function savePalette(init: Pick<Palette, "name" | "colors"> & Partial<Palette>): Promise<Palette> {
  const now = Date.now();
  const p: Palette = { id: crypto.randomUUID(), createdAt: now, ...init, updatedAt: now };
  await set(p.id, p, palettes);
  const pending = new Set((await get<string[]>("pending", meta)) ?? []);
  pending.add(p.id);
  await set("pending", [...pending], meta);
  emit();
  void pushPalettes();
  return p;
}

export async function deletePalette(id: string) {
  await del(id, palettes);
  emit();
  await api(`/palettes/${id}`, { method: "DELETE" }).catch(() => {});
}

export async function pushPalettes() {
  if (!navigator.onLine) return;
  const pending = (await get<string[]>("pending", meta)) ?? [];
  const failed: string[] = [];
  for (const id of pending) {
    const p = await get<Palette>(id, palettes);
    if (!p) continue;
    await api(`/palettes/${id}`, json(p, "PUT")).catch(() => failed.push(id));
  }
  await set("pending", failed, meta);
}

/** Merge server palettes into the local store (newest updatedAt wins). */
export async function pullPalettes() {
  const remote = await api<Palette[]>("/palettes");
  let changed = false;
  for (const r of remote) {
    const local = await get<Palette>(r.id, palettes);
    if (!local || local.updatedAt < r.updatedAt) {
      await set(r.id, r, palettes);
      changed = true;
    }
  }
  if (changed) emit();
}

if (typeof window !== "undefined") window.addEventListener("online", () => void pushPalettes());
