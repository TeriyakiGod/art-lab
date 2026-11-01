import { useEffect, useState } from "react";
import type { Exhibit, Manifest } from "../../../shared/museum/manifest";
import type { FloorPlan } from "../../../shared/museum/generate";
import { act, onAction, readPlayer, type Action } from "../engine/actions";
import { MapView } from "./MapView";
import { ui, useUi } from "./store";
import { lockPointer } from "../engine/pointer";
import { settings, useSettings } from "./settings";
import { ambience } from "../audio/ambience";
import { live, useLive } from "../art/live";

type Props = { manifest: Manifest | null; error: boolean; exhibits: Map<string, Exhibit>; plan: FloorPlan | null };

const isTouch = () => matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;

/** The tour: every work, room by room (the atrium first), in hanging order within each room. */
const tourOrder = (plan: FloorPlan) => plan.slots.map((s, i) => ({ s, i })).sort((a, b) => a.s.room - b.s.room || a.i - b.i).map(({ s }) => s);

/** Looks closely at another work; across rooms the screen fades through black while the visitor moves. */
function focusWork(plan: FloorPlan, id: string) {
  const from = plan.slots.find((s) => s.exhibitId === ui.get().focused);
  const to = plan.slots.find((s) => s.exhibitId === id);
  if (!to) return;
  if (!from || from.room === to.room || settings.get().reducedMotion) return ui.set({ focused: id });
  ui.set({ fading: true });
  setTimeout(() => ui.set({ focused: id }), 220);
  setTimeout(() => ui.set({ fading: false }), 520);
}

/**
 * Everything drawn over the 3D view: the start screen, the crosshair, hints for whichever device is
 * in use, the map, and fades. The art's own information is on its plaque, on the wall.
 */
export function Overlay({ manifest, error, exhibits, plan }: Props) {
  const walking = useUi((s) => s.walking);
  const hovered = useUi((s) => s.hovered);
  const focused = useUi((s) => s.focused);
  const hoveredSeat = useUi((s) => s.hoveredSeat);
  const seated = useUi((s) => s.seated);
  const mode = useUi((s) => s.mode);
  const mapOpen = useUi((s) => s.mapOpen);
  const fading = useUi((s) => s.fading);
  const { quality, sound, lookSpeed, reducedMotion } = useSettings();
  const [pad, setPad] = useState(() => !!navigator.getGamepads?.().some((p) => p?.connected));

  useEffect(() => {
    const on = () => setPad(true);
    window.addEventListener("gamepadconnected", on);
    return () => window.removeEventListener("gamepadconnected", on);
  }, []);

  // Every device's buttons end up here.
  useEffect(() => {
    if (!plan) return;
    const tour = tourOrder(plan);
    onAction((a) => {
      const s = ui.get();
      const step = (d: number) => {
        if (!tour.length) return;
        const i = tour.findIndex((t) => t.exhibitId === s.focused);
        focusWork(plan, tour[(i + d + tour.length) % tour.length].exhibitId);
      };
      if (a === "interact") {
        if (s.focused) { unfocus(); if (!s.walking && s.mode === "mouse") lockPointer(); else ui.set({ walking: true }); }
        else if (s.seated !== null) ui.set({ seated: null });
        else if (s.walking && s.hovered) ui.set({ focused: s.hovered });
        else if (s.walking && s.hoveredSeat !== null) ui.set({ seated: s.hoveredSeat });
      } else if (a === "back") {
        if (s.mapOpen) ui.set({ mapOpen: false });
        else if (s.focused) { unfocus(); if (s.mode !== "mouse") ui.set({ walking: true }); }
        else if (s.seated !== null) ui.set({ seated: null });
      } else if (a === "reroll" && s.focused && exhibits.get(s.focused)?.live) live.reroll(s.focused);
      else if (a === "original" && s.focused) live.original(s.focused);
      else if (a === "copy" && s.focused) copyLink();
      else if (a === "next" || a === "previous") {
        if (s.focused) step(a === "next" ? 1 : -1);
        else if (tour.length) focusWork(plan, nearestWork(plan) ?? tour[0].exhibitId);
      } else if (a === "map") ui.set({ mapOpen: !s.mapOpen });
      else if (a === "pause") {
        if (s.mode === "mouse") void document.exitPointerLock();
        ui.set({ walking: false, focused: null, mapOpen: false });
      }
    });
    return () => onAction(null);
  }, [plan, exhibits]);

  // Keyboard: E, Esc, R, O, C, M; in a close-up the arrow keys tour the museum.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = ui.get();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, Action> = { KeyE: "interact", KeyR: "reroll", KeyO: "original", KeyC: "copy", KeyM: "map" };
      if (map[e.code]) act(map[e.code]);
      else if (e.code === "Escape" && (s.mapOpen || (s.focused && !s.walking))) act("back");
      else if (s.focused && (e.code === "ArrowRight" || e.code === "ArrowLeft")) {
        e.preventDefault();
        act(e.code === "ArrowRight" ? "next" : "previous");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The address bar always links to what you're looking at, re-roll included (once the museum is loaded).
  useLive();
  const reroll = focused ? live.rerolled(focused) : undefined;
  useEffect(() => {
    if (manifest) history.replaceState(null, "", `${location.pathname}${location.search}${focused ? `#/w/${focused}${reroll ? `/${reroll}` : ""}` : ""}`);
  }, [focused, reroll, manifest]);

  const work = focused ? exhibits.get(focused) : undefined;
  const fade = <div className={`fade ${fading ? "on" : ""}`} aria-hidden="true" />;
  const map = mapOpen && plan ? <MapView plan={plan} /> : null;

  if (focused && work) return <>{fade}<FocusHints exhibit={work} walking={walking} mode={mode} />{map}</>;
  if (walking) {
    return (
      <>
        {fade}
        {mode !== "touch" && <div className={`crosshair ${hovered || hoveredSeat !== null ? "on" : ""} ${seated !== null ? "hidden" : ""}`} />}
        {mode !== "touch" && hovered && <kbd className="crosshair-key">{mode === "gamepad" ? "A" : "E"}</kbd>}
        {!hovered && hoveredSeat !== null && mode !== "touch" && (
          <div className="label">
            <strong>Bench</strong>
            <kbd>{mode === "gamepad" ? "A" : "E"}</kbd> <span className="hint">sit</span>
          </div>
        )}
        {seated !== null && (
          <div className="label quiet">
            <span>Take your time.</span>
            <span className="hint">{mode === "touch" ? "tap to stand up" : mode === "gamepad" ? "A or move to stand up" : "E or move to stand up"}</span>
          </div>
        )}
        {mode !== "mouse" && (
          <div className="hud-buttons">
            <button aria-label="Pause" onClick={() => act("pause")}>❚❚</button>
            <button aria-label="Map" onClick={() => act("map")}>Map</button>
          </div>
        )}
        {map}
      </>
    );
  }
  const enter = () => {
    if (settings.get().sound) ambience.start();
    if (isTouch()) ui.set({ mode: "touch", walking: true });
    else { ui.set({ mode: "mouse" }); lockPointer(); }
  };
  const tour = () => {
    if (settings.get().sound) ambience.start();
    if (isTouch()) ui.set({ mode: "touch" });
    const first = plan && tourOrder(plan)[0];
    if (first) ui.set({ focused: first.exhibitId });
  };
  const toggleSound = () => {
    const on = !settings.get().sound;
    settings.set({ sound: on });
    if (on) ambience.start(); else ambience.stop();
  };
  const speeds = ["slow", "normal", "fast"] as const;
  return (
    <div className="start">
      {fade}
      <div className="start-card">
        <h1>Museum</h1>
        <p className="muted">A walkable museum of algorithmic art. The building grows a room each time a new work arrives.</p>
        {error && <p className="muted">Couldn't load the collection.</p>}
        {!error && !manifest && <p className="muted">Loading…</p>}
        {manifest && (
          <>
            <p className="muted small">
              {manifest.exhibits.length} works · {new Set(manifest.exhibits.map((e) => e.collection).filter(Boolean)).size} collections and the main hall
            </p>
            <div className="enter-row">
              <button className="enter" onClick={enter}>{isTouch() ? "Tap to enter" : "Click to enter"}</button>
              <button onClick={tour} title="Go from work to work without walking">Take the tour</button>
            </div>
            {pad && <p className="muted small">Gamepad connected: press A to enter.</p>}
            <dl className="keys">
              {isTouch() ? (
                <>
                  <dt>Left thumb</dt><dd>walk (push far to hurry)</dd>
                  <dt>Right thumb</dt><dd>look around</dd>
                  <dt>Tap</dt><dd>look closer at a work, or sit on a bench</dd>
                </>
              ) : (
                <>
                  <dt>W A S D</dt><dd>walk</dd>
                  <dt>Shift</dt><dd>walk faster</dd>
                  <dt>Mouse</dt><dd>look around</dd>
                  <dt>E / click</dt><dd>look closer at a work, or sit</dd>
                  <dt>← →</dt><dd>up close: the previous or next work</dd>
                  <dt>R</dt><dd>up close: re-roll a live work</dd>
                  <dt>M</dt><dd>map</dd>
                  <dt>Esc</dt><dd>pause</dd>
                </>
              )}
            </dl>
            <div className="toggles">
              <button className={sound ? "on" : ""} aria-pressed={sound} onClick={toggleSound}>Sound {sound ? "on" : "off"}</button>
              <button onClick={() => settings.set({ quality: quality === "high" ? "low" : "high" })} title="Low turns off shadows and ambient occlusion">
                Quality: {quality === "high" ? "High" : "Low"}
              </button>
              <button onClick={() => settings.set({ lookSpeed: speeds[(speeds.indexOf(lookSpeed) + 1) % speeds.length] })}>
                Look speed: {lookSpeed[0].toUpperCase() + lookSpeed.slice(1)}
              </button>
              <button className={reducedMotion ? "on" : ""} aria-pressed={reducedMotion} onClick={() => settings.set({ reducedMotion: !reducedMotion })}
                title="Jump instead of gliding and fading">
                Reduced motion {reducedMotion ? "on" : "off"}
              </button>
            </div>
            <p className="muted small"><a href="/list">See the collection as a list</a></p>
          </>
        )}
      </div>
    </div>
  );
}

/** The work closest to where the visitor stands (to start touring from). */
function nearestWork(plan: FloorPlan) {
  const p = readPlayer();
  if (!p) return undefined;
  const level = p.y > 3 ? 1 : 0;
  return plan.slots
    .filter((s) => s.level === level)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]?.exhibitId;
}

const unfocus = () => ui.set({ focused: null });

let copiedListener: ((on: boolean) => void) | null = null;
function copyLink() {
  void navigator.clipboard.writeText(location.href).then(() => {
    copiedListener?.(true);
    setTimeout(() => copiedListener?.(false), 1500);
  });
}

/** While looking closely: what each control does, tappable, and the re-roll's state. Everything else is on the plaque. */
function FocusHints({ exhibit, walking, mode }: { exhibit: Exhibit; walking: boolean; mode: "mouse" | "touch" | "gamepad" }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    copiedListener = setCopied;
    return () => void (copiedListener = null);
  }, []);
  useLive();
  const rerolled = live.rerolled(exhibit.id);
  const status = live.status(exhibit.id);
  const key = (k: string, pad: string) => (mode === "gamepad" ? pad : mode === "touch" ? null : k);
  const hint = (action: Action, label: string, k: string, padKey: string) => (
    <button className="hint-button" onClick={() => act(action)}>
      {key(k, padKey) && <kbd>{key(k, padKey)}</kbd>} {label}
    </button>
  );
  return (
    <div className="hints" role="toolbar" aria-label="Looking closely">
      {hint("previous", "previous", "←", "LB")}
      {exhibit.live && hint("reroll", rerolled && status === "loading" ? "re-roll (rendering…)" : "re-roll", "R", "X")}
      {rerolled && hint("original", "original", "O", "")}
      {status === "error" && <span className="muted">couldn't run live</span>}
      {hint("copy", copied ? "link copied" : "copy link", "C", "")}
      {walking || mode !== "mouse" ? hint(mode === "mouse" ? "interact" : "back", "back to walking", "E", "B") : <span>click to explore the museum</span>}
      {hint("next", "next", "→", "RB")}
    </div>
  );
}
