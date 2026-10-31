import { useEffect, useState } from "react";
import type { Exhibit, Manifest } from "../../../shared/museum/manifest";
import { ui, useUi } from "./store";
import { lockPointer } from "../engine/pointer";
import { settings, useSettings } from "./settings";
import { ambience } from "../audio/ambience";
import { live, useLive } from "../art/live";

type Props = { manifest: Manifest | null; error: boolean; exhibits: Map<string, Exhibit> };

const isTouch = () => matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;

/**
 * Everything drawn over the 3D view: the start screen, the crosshair, and slim key hints. The art's
 * own information is on its plaque, on the wall.
 */
export function Overlay({ manifest, error, exhibits }: Props) {
  const walking = useUi((s) => s.walking);
  const hovered = useUi((s) => s.hovered);
  const focused = useUi((s) => s.focused);
  const hoveredSeat = useUi((s) => s.hoveredSeat);
  const seated = useUi((s) => s.seated);
  const { quality, sound } = useSettings();

  // Keys: E looks closer or goes back to walking; Esc leaves a close look.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = ui.get();
      if (e.code === "KeyE") {
        if (s.focused) { unfocus(); if (!s.walking) lockPointer(); }
        else if (s.seated !== null) ui.set({ seated: null });
        else if (s.walking && s.hovered) ui.set({ focused: s.hovered });
        else if (s.walking && s.hoveredSeat !== null) ui.set({ seated: s.hoveredSeat });
      } else if (e.code === "Escape" && s.focused && !s.walking) unfocus();
      else if (s.focused && exhibits.get(s.focused)?.live && e.code === "KeyR") live.reroll(s.focused);
      else if (s.focused && e.code === "KeyO") live.original(s.focused);
      else if (s.focused && e.code === "KeyC") copyLink();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exhibits]);

  // The address bar always links to what you're looking at, re-roll included (once the museum is loaded).
  useLive();
  const reroll = focused ? live.rerolled(focused) : undefined;
  useEffect(() => {
    if (manifest) history.replaceState(null, "", `${location.pathname}${location.search}${focused ? `#/w/${focused}${reroll ? `/${reroll}` : ""}` : ""}`);
  }, [focused, reroll, manifest]);

  const work = focused ? exhibits.get(focused) : undefined;

  if (focused && work) return <FocusHints exhibit={work} walking={walking} />;
  if (walking) {
    return (
      <>
        <div className={`crosshair ${hovered || hoveredSeat !== null ? "on" : ""} ${seated !== null ? "hidden" : ""}`} />
        {hovered && <kbd className="crosshair-key">E</kbd>}
        {!hovered && hoveredSeat !== null && (
          <div className="label">
            <strong>Bench</strong>
            <kbd>E</kbd> <span className="hint">sit</span>
          </div>
        )}
        {seated !== null && (
          <div className="label quiet">
            <span>Take your time.</span>
            <kbd>E</kbd> <span className="hint">or move to stand up</span>
          </div>
        )}
      </>
    );
  }
  const enter = () => {
    if (settings.get().sound) ambience.start();
    lockPointer();
  };
  const toggleSound = () => {
    const on = !settings.get().sound;
    settings.set({ sound: on });
    if (on) ambience.start(); else ambience.stop();
  };
  return (
    <div className="start">
      <div className="start-card">
        <h1>Museum</h1>
        <p className="muted">A walkable museum of algorithmic art. The building grows a room each time a new work arrives.</p>
        {error && <p className="muted">Couldn't load the collection.</p>}
        {!error && !manifest && <p className="muted">Loading…</p>}
        {manifest && (
          <>
            <p className="muted small">
              {manifest.exhibits.length} works in {new Set(manifest.exhibits.map((e) => e.wing)).size || 0} wings
            </p>
            {isTouch() ? (
              <p className="muted">Walking on touch screens arrives soon. For now, open the museum on a computer.</p>
            ) : (
              <button className="enter" onClick={enter}>Click to enter</button>
            )}
            <dl className="keys">
              <dt>W A S D</dt><dd>walk</dd>
              <dt>Shift</dt><dd>walk faster</dd>
              <dt>Mouse</dt><dd>look around</dd>
              <dt>E / click</dt><dd>look closer at a work</dd>
              <dt>R</dt><dd>re-roll a live work, up close</dd>
              <dt>E</dt><dd>sit on a bench</dd>
              <dt>Esc</dt><dd>pause</dd>
            </dl>
            <div className="toggles">
              <button className={sound ? "on" : ""} aria-pressed={sound} onClick={toggleSound}>Sound {sound ? "on" : "off"}</button>
              <button onClick={() => settings.set({ quality: quality === "high" ? "low" : "high" })} title="Low turns off shadows and ambient occlusion">
                Quality: {quality === "high" ? "High" : "Low"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const unfocus = () => ui.set({ focused: null });

let copiedListener: ((on: boolean) => void) | null = null;
function copyLink() {
  void navigator.clipboard.writeText(location.href).then(() => {
    copiedListener?.(true);
    setTimeout(() => copiedListener?.(false), 1500);
  });
}

/** While looking closely: what the keys do, and the re-roll's state. Everything else is on the plaque. */
function FocusHints({ exhibit, walking }: { exhibit: Exhibit; walking: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    copiedListener = setCopied;
    return () => void (copiedListener = null);
  }, []);
  useLive();
  const rerolled = live.rerolled(exhibit.id);
  const status = live.status(exhibit.id);
  return (
    <div className="hints" role="status">
      {exhibit.live && <span><kbd>R</kbd> re-roll{rerolled && status === "loading" ? " (rendering…)" : ""}</span>}
      {rerolled && <span><kbd>O</kbd> original</span>}
      {status === "error" && <span className="muted">couldn't run live</span>}
      <span><kbd>C</kbd> {copied ? "link copied" : "copy link"}</span>
      <span>{walking ? <><kbd>E</kbd> back to walking</> : "click to explore the museum"}</span>
    </div>
  );
}
