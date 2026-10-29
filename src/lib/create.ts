import type { Sketch } from "../../shared/types";
import { newId, randomSeed, saveSketch } from "./store";

export async function createSketch(init: Pick<Sketch, "title" | "code"> & Partial<Pick<Sketch, "seed" | "values" | "width" | "height">>) {
  const now = Date.now();
  const s: Sketch = { id: newId(), seed: randomSeed(), values: {}, width: 1000, height: 1000, ...init, createdAt: now, updatedAt: now };
  await saveSketch(s);
  location.hash = `#/sketch/${s.id}`;
  return s;
}
