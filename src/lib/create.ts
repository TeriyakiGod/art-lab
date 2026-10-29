import type { Sketch } from "../../shared/types";
import { newId, randomSeed, saveSketch } from "./store";

export async function createSketch(init: { title: string; code: string }) {
  const now = Date.now();
  const s: Sketch = { id: newId(), title: init.title, code: init.code, seed: randomSeed(), values: {}, width: 1000, height: 1000, createdAt: now, updatedAt: now };
  await saveSketch(s);
  location.hash = `#/sketch/${s.id}`;
  return s;
}
