import { addLook, setAnalog } from "./input";
import { act, type Action } from "./actions";
import { ui } from "../ui/store";

/**
 * Gamepads (standard mapping): left stick walks, right stick looks, A looks closer or sits, B
 * steps back, X re-rolls, Y opens the map, bumpers step between works, Start pauses.
 * Polled once a frame by the Player.
 */
const DEAD = 0.15;
/** Mouse-pixel units per second at full right-stick tilt. */
const LOOK_RATE = 900;
const BUTTONS: Record<number, Action> = { 0: "interact", 1: "back", 2: "reroll", 3: "map", 4: "previous", 5: "next", 9: "pause" };

const was = new Map<number, boolean>();
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export function pollGamepad(dt: number) {
  const pad = navigator.getGamepads?.().find((p) => p && p.connected && p.mapping === "standard");
  if (!pad) return;
  const [lx, ly, rx, ry] = pad.axes.map(dz);
  const pressed = pad.buttons.map((b) => b.pressed);
  const active = lx || ly || rx || ry || pressed.some(Boolean);
  if (active && ui.get().mode !== "gamepad") ui.set({ mode: "gamepad" });
  if (ui.get().mode !== "gamepad") return;
  setAnalog("pad", lx, -ly);
  if (rx || ry) addLook(rx * Math.abs(rx) * LOOK_RATE * dt, ry * Math.abs(ry) * LOOK_RATE * dt);
  for (const [i, action] of Object.entries(BUTTONS)) {
    const now = !!pressed[+i];
    if (now && !was.get(+i)) {
      // A gamepad press on the start screen enters the museum.
      if (!ui.get().walking && !ui.get().focused && (action === "interact" || action === "pause")) ui.set({ walking: true });
      else act(action);
    }
    was.set(+i, now);
  }
}
