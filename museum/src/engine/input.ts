/**
 * Turns keyboard, mouse, touch and gamepad into an `Intent` and a look delta: the only things
 * movement code reads. Network players (phase 5) produce the same shape.
 */
export type Intent = {
  /** x: strafe right, y: forward; each in [-1, 1]. */
  move: { x: number; y: number };
  run: boolean;
};

const keys = new Set<string>();
let lookDx = 0;
let lookDy = 0;
/** Analog movement from the touch joystick and the gamepad's left stick; replaced each frame. */
const analog = { touch: { x: 0, y: 0 }, pad: { x: 0, y: 0 } };

/** Radians per pixel of mouse movement at "normal" look speed. */
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
  let x = axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]) + analog.touch.x + analog.pad.x;
  let y = axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]) + analog.touch.y + analog.pad.y;
  const len = Math.hypot(x, y);
  // Sticks keep their partial tilt (walk slowly); anything past full is capped.
  if (len > 1) { x /= len; y /= len; }
  const stick = Math.max(Math.hypot(analog.touch.x, analog.touch.y), Math.hypot(analog.pad.x, analog.pad.y));
  return { move: { x, y }, run: keys.has("ShiftLeft") || keys.has("ShiftRight") || stick > 0.95 };
}

/** Look movement since the last call, in mouse-pixel units. */
export function takeLook() {
  const d = { dx: lookDx, dy: lookDy };
  lookDx = lookDy = 0;
  return d;
}

/** Touch drags and the gamepad's right stick add look movement here, in mouse-pixel units. */
export function addLook(dx: number, dy: number) {
  lookDx += dx;
  lookDy += dy;
}

export function setAnalog(source: "touch" | "pad", x: number, y: number) {
  analog[source].x = x;
  analog[source].y = y;
}

export const clearInput = () => {
  keys.clear();
  lookDx = lookDy = 0;
  analog.touch = { x: 0, y: 0 };
  analog.pad = { x: 0, y: 0 };
};
