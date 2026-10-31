import { useEffect, useState } from "react";
import type { Exhibit, Manifest } from "../../../shared/museum/manifest";
import { ui, useUi } from "./store";
import { lockPointer } from "../engine/pointer";

type Props = { manifest: Manifest | null; error: boolean; exhibits: Map<string, Exhibit> };

const isTouch = () => matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;

/** Everything drawn over the 3D view: start screen, crosshair, the label of the work you're facing, focus panel. */
export function Overlay({ manifest, error, exhibits }: Props) {
  const walking = useUi((s) => s.walking);
  const hovered = useUi((s) => s.hovered);
  const focused = useUi((s) => s.focused);

  // Keys: E looks closer or goes back to walking; Esc leaves a close look.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = ui.get();
      if (e.code === "KeyE") {
        if (s.focused) { unfocus(); lockPointer(); }
        else if (s.walking && s.hovered) { ui.set({ focused: s.hovered }); void document.exitPointerLock(); }
      } else if (e.code === "Escape" && s.focused) unfocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The address bar always links to what you're looking at (once the museum is loaded).
  useEffect(() => {
    if (manifest) history.replaceState(null, "", focused ? `#/w/${focused}` : location.pathname);
  }, [focused, manifest]);

  const work = focused ? exhibits.get(focused) : hovered ? exhibits.get(hovered) : undefined;

  if (focused && work) return <FocusPanel exhibit={work} />;
  if (walking) {
    return (
      <>
        <div className={`crosshair ${hovered ? "on" : ""}`} />
        {work && (
          <div className="label">
            <strong>{work.title}</strong>
            <span>{work.wing} · {work.size.w} × {work.size.h} m</span>
            <kbd>E</kbd> <span className="hint">look closer</span>
          </div>
        )}
      </>
    );
  }
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
              <button className="enter" onClick={lockPointer}>Click to enter</button>
            )}
            <dl className="keys">
              <dt>W A S D</dt><dd>walk</dd>
              <dt>Shift</dt><dd>walk faster</dd>
              <dt>Mouse</dt><dd>look around</dd>
              <dt>E / click</dt><dd>look closer at a work</dd>
              <dt>Esc</dt><dd>pause</dd>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}

const unfocus = () => ui.set({ focused: null });

function FocusPanel({ exhibit }: { exhibit: Exhibit }) {
  const [copied, setCopied] = useState(false);
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
        <dt>Seed</dt><dd><code>{exhibit.seed}</code></dd>
        <dt>Size</dt><dd>{exhibit.size.w} × {exhibit.size.h} m</dd>
        <dt>Engine</dt><dd>{exhibit.engine === "p5" ? "p5.js" : "Canvas"}</dd>
        <dt>Added</dt><dd>{new Date(exhibit.createdAt).toLocaleDateString()}</dd>
      </dl>
      {exhibit.palette.length > 0 && (
        <div className="palette" aria-label="Palette">
          {exhibit.palette.map((c) => <span key={c} style={{ background: c }} title={c} />)}
        </div>
      )}
      <div className="actions">
        <button className="enter" onClick={() => { unfocus(); lockPointer(); }}>Back to walking <kbd>E</kbd></button>
        <button onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
      </div>
    </aside>
  );
}
