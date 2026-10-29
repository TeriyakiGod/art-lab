import { LESSONS } from "../../shared/lessons";
import type { HintLevel } from "../../shared/types";
import { createSketch } from "./create";

// Which lesson challenge a sketch is an attempt at, and how much help was asked
// for so far. Per device is enough: it only shapes the assistant's hints.
const key = (sketchId: string) => `art-lab:challenge:${sketchId}`;

export function getChallenge(sketchId: string): { lessonId: string; hints: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(sketchId)) ?? "null");
    return v && LESSONS.some((l) => l.id === v.lessonId) ? v : null;
  } catch { return null; }
}

export function setHintsUsed(sketchId: string, lessonId: string, hints: number) {
  try { localStorage.setItem(key(sketchId), JSON.stringify({ lessonId, hints })); } catch { /* private mode */ }
}

export const nextHint = (used: number): HintLevel => (Math.min(3, used + 1) as HintLevel);

/** A starter sketch for a lesson's challenge, linked to it so the assistant coaches instead of solving. */
export async function startChallenge(lessonId: string) {
  const lesson = LESSONS.find((l) => l.id === lessonId);
  if (!lesson?.challenge) return;
  const brief = lesson.challenge.replace(/\*\*/g, "").split("\n").map((l) => `// ${l}`.trimEnd()).join("\n");
  const code = `// Challenge from "${lesson.title}":\n${brief}\n\nawait $genart.waitForAdapter();\nconst param = await $genart.setParams({});\n\nconst { ctx, width, height } = lab.canvas();\nconst rnd = $genart.random.rnd;\n\nctx.fillStyle = "#f1ece2";\nctx.fillRect(0, 0, width, height);\n\n// Your code here.\n`;
  const s = await createSketch({ title: `Challenge: ${lesson.title.replace(/^\d+\.\s*/, "")}`, code }, false);
  setHintsUsed(s.id, lessonId, 0);
  location.hash = `#/sketch/${s.id}`;
}
