import type { Sketch } from "../../shared/types";
import { newId, randomSeed, saveSketch } from "./store";

export async function createSketch(init: Pick<Sketch, "title" | "code"> & Partial<Pick<Sketch, "engine" | "seed" | "values" | "width" | "height">>, open = true) {
  const now = Date.now();
  const s: Sketch = { id: newId(), seed: randomSeed(), values: {}, width: 1000, height: 1000, ...init, createdAt: now, updatedAt: now };
  await saveSketch(s);
  if (open) location.hash = `#/sketch/${s.id}`;
  return s;
}
