import { addLook, setAnalog } from "./input";
import { act, pickAt } from "./actions";
import { ui } from "../ui/store";

/**
 * Touch controls: a virtual joystick wherever the left thumb lands (left 45% of the screen),
 * drag-to-look on the right, and taps: a work to look closer, a bench to sit, anywhere while
 * looking closely to step back.
 */
const JOY_RADIUS = 56;
const TAP_MS = 250;
const TAP_MOVE = 10;
/** Mouse-pixel units per screen pixel of look drag. */
const LOOK_SCALE = 1.6;

export function attachTouch(canvas: HTMLCanvasElement) {
  const ring = document.createElement("div");
  ring.className = "joystick";
  ring.innerHTML = '<div class="joystick-knob"></div>';
  ring.hidden = true;
  document.body.appendChild(ring);
  const knob = ring.firstElementChild as HTMLDivElement;

  let joy: { id: number; x: number; y: number } | null = null;
  const looks = new Map<number, { x: number; y: number; startX: number; startY: number; t: number }>();

  const isTouch = (e: PointerEvent) => e.pointerType === "touch" || e.pointerType === "pen";

  const down = (e: PointerEvent) => {
    if (!isTouch(e)) return;
    ui.set({ mode: "touch" });
    canvas.setPointerCapture(e.pointerId);
    if (!joy && e.clientX < window.innerWidth * 0.45 && !ui.get().focused) {
      joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
      ring.hidden = false;
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
      knob.style.transform = "translate(-50%, -50%)";
    } else {
      looks.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, t: performance.now() });
    }
  };

  const move = (e: PointerEvent) => {
    if (!isTouch(e)) return;
    if (joy && e.pointerId === joy.id) {
      let dx = e.clientX - joy.x, dy = e.clientY - joy.y;
      const d = Math.hypot(dx, dy);
      if (d > JOY_RADIUS) { dx *= JOY_RADIUS / d; dy *= JOY_RADIUS / d; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // A small dead zone in the middle.
      const k = Math.max(0, Math.min(d, JOY_RADIUS) - 6) / (JOY_RADIUS - 6) / (d || 1);
      setAnalog("touch", dx * k, -dy * k);
      return;
    }
    const l = looks.get(e.pointerId);
    if (!l) return;
    if (ui.get().walking && !ui.get().focused) addLook((e.clientX - l.x) * LOOK_SCALE, (e.clientY - l.y) * LOOK_SCALE);
    l.x = e.clientX;
    l.y = e.clientY;
  };

  const up = (e: PointerEvent) => {
    if (!isTouch(e)) return;
    if (joy && e.pointerId === joy.id) {
      joy = null;
      ring.hidden = true;
      setAnalog("touch", 0, 0);
      return;
    }
    const l = looks.get(e.pointerId);
    looks.delete(e.pointerId);
    // A quick tap that barely moved: interact with whatever is under the finger.
    if (l && performance.now() - l.t < TAP_MS && Math.hypot(e.clientX - l.startX, e.clientY - l.startY) < TAP_MOVE) {
      const s = ui.get();
      if (s.focused) return act("back");
      if (s.seated !== null) return act("interact");
      const hit = pickAt((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (hit.exhibit) ui.set({ focused: hit.exhibit });
      else if (hit.seat !== undefined) ui.set({ seated: hit.seat });
    }
  };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    ring.remove();
    setAnalog("touch", 0, 0);
  };
}
