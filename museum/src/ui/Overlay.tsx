import { useEffect, useState } from "react";
import type { Exhibit, Manifest } from "../../../shared/museum/manifest";
import { ui, useUi } from "./store";
import { lockPointer } from "../engine/pointer";
import { settings, useSettings } from "./settings";
import { ambience } from "../audio/ambience";
import { live, useLive } from "../art/live";

type Props = { manifest: Manifest | null; error: boolean; exhibits: Map<string, Exhibit> };

const isTouch = () => matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;

/** Everything drawn over the 3D view: start screen, crosshair, the label of the work you're facing, focus panel. */
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
        if (s.focused) { unfocus(); lockPointer(); }
        else if (s.seated !== null) ui.set({ seated: null });
        else if (s.walking && s.hovered) { ui.set({ focused: s.hovered }); void document.exitPointerLock(); }
        else if (s.walking && s.hoveredSeat !== null) ui.set({ seated: s.hoveredSeat });
      } else if (e.code === "Escape" && s.focused) unfocus();
      else if (e.code === "KeyR" && s.focused && exhibits.get(s.focused)?.live) live.reroll(s.focused);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exhibits]);

  // The address bar always links to what you're looking at, re-roll included (once the museum is loaded).
  useLive();
  const reroll = focused ? live.rerolled(focused) : undefined;
  useEffect(() => {
    if (manifest) history.replaceState(null, "", focused ? `#/w/${focused}${reroll ? `/${reroll}` : ""}` : location.pathname);
  }, [focused, reroll, manifest]);

  const work = focused ? exhibits.get(focused) : hovered ? exhibits.get(hovered) : undefined;

  if (focused && work) return <FocusPanel exhibit={work} />;
  if (walking) {
    return (
      <>
        <div className={`crosshair ${hovered || hoveredSeat !== null ? "on" : ""} ${seated !== null ? "hidden" : ""}`} />
        {work && (
          <div className="label">
            <strong>{work.title}</strong>
            <span>{work.wing} · {work.size.w} × {work.size.h} m</span>
            <kbd>E</kbd> <span className="hint">look closer</span>
          </div>
        )}
        {!work && hoveredSeat !== null && (
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

function FocusPanel({ exhibit }: { exhibit: Exhibit }) {
  const [copied, setCopied] = useState(false);
  useLive();
  const rerolled = live.rerolled(exhibit.id);
  const status = live.status(exhibit.id);
  const copy = () => {
    void navigator.clipboard.writeText(location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <aside className="focus">
      <p className="eyebrow">{exhibit.wing}</p>
      <h2>{exhibit.title}</h2>
      {exhibit.statement && <p className="statement">{exhibit.statement}</p>}
      <dl className="facts">
        <dt>Seed</dt>
        <dd>
          <code>{rerolled ?? exhibit.seed}</code>
          {rerolled && <span className="muted small"> · your re-roll{status === "loading" ? ", rendering…" : ""}</span>}
          {status === "error" && <span className="muted small"> · couldn't run live</span>}
        </dd>
        <dt>Size</dt><dd>{exhibit.size.w} × {exhibit.size.h} m</dd>
        <dt>Engine</dt><dd>{exhibit.engine === "p5" ? "p5.js" : "Canvas"}</dd>
        <dt>Added</dt><dd>{new Date(exhibit.createdAt).toLocaleDateString()}</dd>
      </dl>
      {exhibit.palette.length > 0 && (
        <div className="palette" aria-label="Palette">
          {exhibit.palette.map((c) => <span key={c} style={{ background: c }} title={c} />)}
        </div>
      )}
      {exhibit.live ? (
        <div className="reroll">
          <p className="muted small">
            This work is a program. Run it with a new seed to see a version nobody has seen before.
          </p>
          <div className="actions">
            <button onClick={() => live.reroll(exhibit.id)}>Re-roll <kbd>R</kbd></button>
            {rerolled && <button onClick={() => live.original(exhibit.id)}>Show original</button>}
          </div>
        </div>
      ) : (
        <p className="muted small">The artist keeps this work's code private, so it can't be re-rolled.</p>
      )}
      <div className="actions bottom">
        <button className="enter" onClick={() => { unfocus(); if (settings.get().sound) ambience.start(); lockPointer(); }}>Back to walking <kbd>E</kbd></button>
        <button onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
      </div>
    </aside>
  );
}
