/**
 * Turns keyboard and mouse into an `Intent`, the only thing movement code reads. Touch and gamepad
 * (plan phase 4) and network players (phase 5) produce the same shape.
 */
export type Intent = {
  /** x: strafe right, y: forward; each in [-1, 1]. */
  move: { x: number; y: number };
  run: boolean;
};

const keys = new Set<string>();
let lookDx = 0;
let lookDy = 0;

export const LOOK_SENSITIVITY = 0.0022;

export function attachInput(canvas: HTMLElement) {
  const down = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    keys.add(e.code);
  };
  const up = (e: KeyboardEvent) => keys.delete(e.code);
  const blur = () => keys.clear();
  const move = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    lookDx += e.movementX;
    lookDy += e.movementY;
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  document.addEventListener("mousemove", move);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    document.removeEventListener("mousemove", move);
  };
}

const axis = (pos: string[], neg: string[]) => (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);

export function readIntent(): Intent {
  const x = axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]);
  const y = axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]);
  const len = Math.hypot(x, y) || 1;
  return { move: { x: x / len, y: y / len }, run: keys.has("ShiftLeft") || keys.has("ShiftRight") };
}

/** Mouse movement since the last call, in pixels. */
export function takeLook() {
  const d = { dx: lookDx, dy: lookDy };
  lookDx = lookDy = 0;
  return d;
}

export const clearInput = () => {
  keys.clear();
  lookDx = lookDy = 0;
};
