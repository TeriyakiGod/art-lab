import { createStore, del, entries, get, set } from "idb-keyval";
import type { Sketch } from "../../shared/types";
import { api, json } from "./api";

// Local-first: every edit lands in IndexedDB immediately and is pushed to D1
// in the background. Works offline; pending ids are retried when back online.
const sketches = createStore("art-lab", "sketches");
const meta = createStore("art-lab-meta", "meta");

type Listener = () => void;
const listeners = new Set<Listener>();
export const subscribe = (l: Listener) => (listeners.add(l), () => void listeners.delete(l));
const emit = () => listeners.forEach((l) => l());

export async function listSketches(): Promise<Sketch[]> {
  const all = await entries<string, Sketch>(sketches);
  return all.map(([, s]) => s).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getSketch = (id: string) => get<Sketch>(id, sketches);

export async function saveSketch(s: Sketch) {
  await set(s.id, s, sketches);
  const pending = new Set((await get<string[]>("pending", meta)) ?? []);
  pending.add(s.id);
  await set("pending", [...pending], meta);
  emit();
  scheduleSync();
}

export async function deleteSketch(id: string) {
  await del(id, sketches);
  emit();
  await api(`/sketches/${id}`, { method: "DELETE" }).catch(() => {});
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSync(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => void pushPending(), delay);
}

export async function pushPending() {
  if (!navigator.onLine) return;
  const pending = (await get<string[]>("pending", meta)) ?? [];
  const failed: string[] = [];
  for (const id of pending) {
    const s = await getSketch(id);
    if (!s) continue;
    try {
      await api(`/sketches/${id}`, json(s, "PUT"));
    } catch {
      failed.push(id);
    }
  }
  await set("pending", failed, meta);
}

/** Make sure a sketch exists on the server (needed before versions/outputs). */
export async function ensureSynced(s: Sketch) {
  await api(`/sketches/${s.id}`, json(s, "PUT"));
}

/** Merge server sketches into the local store (newest updatedAt wins). */
export async function pullSketches() {
  const remote = await api<Sketch[]>("/sketches");
  let changed = false;
  for (const r of remote) {
    const local = await getSketch(r.id);
    if (!local || local.updatedAt < r.updatedAt) {
      await set(r.id, r, sketches);
      changed = true;
    }
  }
  if (changed) emit();
}

export const newId = () => crypto.randomUUID();
export const randomSeed = () => Math.random().toString(36).slice(2, 10);

if (typeof window !== "undefined") window.addEventListener("online", () => void pushPending());
