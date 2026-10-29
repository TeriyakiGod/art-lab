import { useCallback, useEffect, useRef, useState } from "react";
import { ENGINES, type Engine, type Output, type Sketch, type Version } from "../../shared/types";
import { SketchFrame, renderToPNG, type SketchFrameHandle } from "../runtime/SketchFrame";
import { SINGLE_CANVAS_PIXELS, renderLargePNG } from "../runtime/bigExport";
import type { ParamSpec } from "../runtime/sandbox";
import { api, json } from "../lib/api";
import { ensureSynced, getSketch, randomSeed, saveSketch } from "../lib/store";
import { Editor } from "./Editor";
import { ParamsPanel } from "./ParamsPanel";
import { SeedBar } from "./SeedBar";
import { ChatPanel } from "./ChatPanel";
import { Variations } from "./Variations";
import { DiffStats, DiffView, diffSummary } from "./DiffView";
import { PalettePanel } from "./PalettePanel";
import { useStageGestures } from "./useStageGestures";
import { PALETTE_KEY } from "../../shared/palettes";

export type StudioTab = "canvas" | "tweak" | "code" | "chat";
type SideTab = "tweak" | "chat" | "saved";

interface Props {
  sketchId: string;
  userId: string;
  desktop: boolean;
  tab: StudioTab;
}

export function Studio({ sketchId, userId, desktop, tab }: Props) {
  const [sketch, setSketch] = useState<Sketch | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    getSketch(sketchId).then((s) => {
      if (!live) return;
      if (s) setSketch(s);
      else setMissing(true);
    });
    return () => { live = false; };
  }, [sketchId]);

  if (missing) return <div className="pad"><p>This sketch doesn't exist on this device.</p><a href="#/">Back to sketches</a></div>;
  if (!sketch) return <div className="pad muted">Loading…</div>;
  return <StudioInner key={sketch.id} initial={sketch} userId={userId} desktop={desktop} tab={tab} />;
}

function StudioInner({ initial, userId, desktop, tab }: { initial: Sketch; userId: string; desktop: boolean; tab: StudioTab }) {
  const [sketch, setSketchState] = useState(initial);
  const [draft, setDraft] = useState(initial.code);
  const [specs, setSpecs] = useState<Record<string, ParamSpec>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [logs, setLogs] = useState<{ level: string; text: string }[]>([]);
  const [seedHistory, setSeedHistory] = useState<string[]>([]);
  const [side, setSide] = useState<SideTab>("tweak");
  const [autoRun, setAutoRun] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showVariations, setShowVariations] = useState(false);
  const frame = useRef<SketchFrameHandle>(null);

  // Slider drags fire many changes; re-run the sketch at most every ~80 ms.
  const [runValues, setRunValues] = useState(initial.values);
  useEffect(() => {
    const t = setTimeout(() => setRunValues(sketch.values), 80);
    return () => clearTimeout(t);
  }, [sketch.values]);

  const update = useCallback((patch: Partial<Sketch>) => {
    setSketchState((s) => {
      const next = { ...s, ...patch, updatedAt: Date.now() };
      void saveSketch(next);
      return next;
    });
  }, []);

  // Code runs a moment after you stop typing (or on Ctrl/Cmd+Enter when auto-run is off).
  useEffect(() => {
    if (!autoRun || draft === sketch.code) return;
    const t = setTimeout(() => update({ code: draft }), 700);
    return () => clearTimeout(t);
  }, [draft, autoRun, sketch.code, update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        update({ code: draft });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, update]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const setSeed = (seed: string) => {
    setSeedHistory((h) => [...h.slice(-49), sketch.seed]);
    update({ seed });
  };
  const backSeed = () => {
    const prev = seedHistory.at(-1);
    if (prev === undefined) return;
    setSeedHistory((h) => h.slice(0, -1));
    update({ seed: prev });
  };

  const applyCode = (code: string) => {
    setDraft(code);
    update({ code });
  };

  const exportPNG = async (scale: number) => {
    setBusy(`Rendering ${scale}×…`);
    try {
      const opts = { code: sketch.code, engine: sketch.engine, seed: sketch.seed, values: sketch.values, width: sketch.width, height: sketch.height, scale };
      // Too big for one canvas (especially on phones): render in strips.
      const blob = sketch.width * sketch.height * scale * scale > SINGLE_CANVAS_PIXELS
        ? await renderLargePNG(opts, (done, total) => setBusy(`Rendering ${scale}×… ${Math.round((done / total) * 100)}%`))
        : await renderToPNG(opts);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${sketch.title.replace(/\W+/g, "-").toLowerCase() || "sketch"}-${sketch.seed}@${scale}x.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      flash(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const saveOutput = async () => {
    setBusy("Saving…");
    try {
      await ensureSynced(sketch);
      const blob = await renderToPNG({ code: sketch.code, engine: sketch.engine, seed: sketch.seed, values: sketch.values, width: sketch.width, height: sketch.height, scale: 2 });
      const form = new FormData();
      form.set("image", new File([blob], "output.png", { type: "image/png" }));
      form.set("meta", JSON.stringify({ sketchId: sketch.id, code: sketch.code, engine: sketch.engine ?? "canvas", seed: sketch.seed, values: sketch.values, width: sketch.width * 2, height: sketch.height * 2 }));
      await api<Output>("/outputs", { method: "POST", body: form });
      flash("Saved to this sketch's gallery");
    } catch (e) {
      flash(navigator.onLine ? `Couldn't save: ${(e as Error).message}` : "You're offline. Saving outputs needs a connection.");
    } finally {
      setBusy(null);
    }
  };

  const saveVersion = async () => {
    const message = prompt("Describe this version (optional)") ?? undefined;
    if (message === undefined) return;
    try {
      await ensureSynced(sketch);
      await api<Version>(`/sketches/${sketch.id}/versions`, json({ code: sketch.code, message }));
      flash("Version saved");
    } catch (e) {
      flash(`Couldn't save version: ${(e as Error).message}`);
    }
  };

  // Touch: swipe for seeds, pinch/pan to zoom, double-tap to reset, long-press to save.
  const gestures = useStageGestures({
    onSwipeLeft: () => setSeed(randomSeed()),
    onSwipeRight: backSeed,
    onLongPress: () => void saveOutput(),
  });
  const panes = usePaneWidths(desktop);

  const activePalette = sketch.values[PALETTE_KEY] as string[] | undefined;
  const tweak = (
    <>
      <ParamsPanel
        specs={specs}
        values={sketch.values}
        onChange={(id, v) => update({ values: { ...sketch.values, [id]: v } })}
        onReset={(id) => {
          const { [id]: _, ...rest } = sketch.values;
          update({ values: rest });
        }}
      />
      <PalettePanel
        active={activePalette}
        onChange={(colors) => {
          const { [PALETTE_KEY]: _, ...rest } = sketch.values;
          update({ values: colors ? { ...rest, [PALETTE_KEY]: colors } : rest });
        }}
      />
    </>
  );
  const chat = (
    <ChatPanel
      userId={userId}
      sketch={sketch}
      errors={errors}
      onApplyCode={applyCode}
      onSetParams={(values) => update({ values: { ...sketch.values, ...values } })}
      capture={async () => {
        const blob = await frame.current!.capture(640, "image/jpeg");
        return new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
      }}
    />
  );

  return (
    <div className={`studio ${desktop ? "desktop" : `mobile tab-${tab}`}`} style={panes.style}>
      {desktop && <PaneDivider side="code" onDrag={panes.drag} />}
      {desktop && <PaneDivider side="side" onDrag={panes.drag} />}
      <section className="pane code-pane">
        <div className="pane-bar">
          <input className="title-input" aria-label="Sketch title" value={sketch.title} onChange={(e) => update({ title: e.target.value })} />
          <select aria-label="Engine" className="engine-select" value={sketch.engine ?? "canvas"} title="What the code is written for"
            onChange={(e) => update({ engine: e.target.value as Engine })}>
            {ENGINES.map((en) => <option key={en.id} value={en.id}>{en.label}</option>)}
          </select>
          <label className="small row" title="Run automatically while typing">
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} /> auto-run
          </label>
          {!autoRun && <button onClick={() => update({ code: draft })} title="Ctrl/Cmd + Enter">Run ▶</button>}
        </div>
        <Editor value={draft} onChange={setDraft} />
        <Console errors={errors} logs={logs} onClear={() => setLogs([])} />
      </section>

      <section className="pane stage-pane">
        <div className="stage">
          <div className="stage-zoom" style={gestures.style}>
          <SketchFrame
            ref={frame}
            className="stage-frame"
            code={sketch.code}
            engine={sketch.engine}
            seed={sketch.seed}
            values={runValues}
            width={sketch.width}
            height={sketch.height}
            onRun={() => {
              setErrors([]);
              setLogs([]);
            }}
            onParams={setSpecs}
            onError={(e) => setErrors((list) => [...list.slice(-9), e.line ? `Line ${e.line}: ${e.message}` : e.message])}
            onLog={(level, text) => setLogs((l) => [...l.slice(-99), { level, text }])}
          />
          </div>
          {/* Touches would go into the sketch iframe; this layer catches them first. */}
          {!desktop && <div className="stage-touch" {...gestures.handlers} aria-hidden />}
          {gestures.view.scale > 1 && <button className="zoom-reset" onClick={gestures.reset}>{Math.round(gestures.view.scale * 100)}% · reset</button>}
        </div>
        {!desktop && errors.length > 0 && <div className="stage-error" role="alert">{errors.at(-1)}</div>}
        <div className="stage-bar">
          <SeedBar seed={sketch.seed} history={seedHistory} onSeed={setSeed} onBack={backSeed} />
          <div className="row">
            <button onClick={() => setShowVariations(true)} title="Explore 16 variations of this sketch">Variations</button>
            <button onClick={saveOutput} disabled={!!busy} title="Save this seed + params as an output">★ Save</button>
            <ExportMenu disabled={!!busy} maxScale={sketch.engine === "p5" ? 4 : 8} onExport={exportPNG} onVersion={saveVersion} />
          </div>
        </div>
        {busy && <div className="busy">{busy}</div>}
      </section>

      {desktop ? (
        <section className="pane side-pane">
          <div className="tabs" role="tablist">
            {(["tweak", "chat", "saved"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={side === t} className={side === t ? "on" : ""} onClick={() => setSide(t)}>
                {t === "tweak" ? "Tweak" : t === "chat" ? "Assistant" : "Saved"}
              </button>
            ))}
          </div>
          <div className="side-body" hidden={side !== "tweak"}>{tweak}</div>
          <div className="side-body chat-body" hidden={side !== "chat"}>{chat}</div>
          {side === "saved" && <div className="side-body"><Saved sketch={sketch} onRestore={(p) => update(p)} onCode={applyCode} /></div>}
        </section>
      ) : (
        <>
          <section className="pane tweak-pane">
            {tweak}
            <details className="pad"><summary>Saved outputs & versions</summary><Saved sketch={sketch} onRestore={(p) => update(p)} onCode={applyCode} /></details>
          </section>
          <section className="pane chat-pane">{chat}</section>
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      {showVariations && (
        <Variations
          sketch={sketch}
          specs={specs}
          onClose={() => setShowVariations(false)}
          onPick={(v) => {
            setSeedHistory((h) => [...h.slice(-49), sketch.seed]);
            update({ seed: v.seed, values: v.values });
            setShowVariations(false);
          }}
        />
      )}
    </div>
  );
}

// p5 draws to its own canvas, so it can't be rendered in strips: no 8× (see bigExport.ts).
function ExportMenu({ disabled, maxScale, onExport, onVersion }: { disabled: boolean; maxScale: number; onExport(scale: number): void; onVersion(): void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pick = (fn: () => void) => () => {
    if (menu.current) menu.current.open = false;
    fn();
  };
  return (
    <details className="menu" ref={menu}>
      <summary aria-disabled={disabled}>Export ▾</summary>
      <div className="menu-list">
        {[1, 2, 4, 8].filter((s) => s <= maxScale).map((s) => <button key={s} disabled={disabled} onClick={pick(() => onExport(s))}>PNG {s}×</button>)}
        <button onClick={pick(onVersion)}>Save code version…</button>
      </div>
    </details>
  );
}

function Console({ errors, logs, onClear }: { errors: string[]; logs: { level: string; text: string }[]; onClear(): void }) {
  if (!errors.length && !logs.length) return null;
  return (
    <div className="console" aria-live="polite">
      <div className="row small"><strong>Console</strong><button className="link" onClick={onClear}>clear</button></div>
      {errors.map((e, i) => <div key={`e${i}`} className="log error">⛔ {e}</div>)}
      {logs.map((l, i) => <div key={i} className={`log ${l.level}`}>{l.text}</div>)}
    </div>
  );
}

function Saved({ sketch, onRestore, onCode }: { sketch: Sketch; onRestore(p: Partial<Sketch>): void; onCode(code: string): void }) {
  const [outputs, setOutputs] = useState<Output[] | null>(null);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Output[]>(`/outputs?sketch=${sketch.id}`).then(setOutputs, () => setErr("Saved items need a connection."));
    api<Version[]>(`/sketches/${sketch.id}/versions`).then(setVersions, () => setVersions([]));
  }, [sketch.id]);
  if (err) return <p className="muted pad">{err}</p>;
  return (
    <div className="pad saved">
      <h3>Outputs</h3>
      {outputs?.length === 0 && <p className="muted small">Press ★ Save to keep a seed + params you like.</p>}
      <div className="thumbs">
        {outputs?.map((o) => (
          <button key={o.id} className="thumb" title={`Seed ${o.seed}`} onClick={() => onRestore({ seed: o.seed, values: o.values })}>
            <img src={o.url} alt={`Output with seed ${o.seed}`} loading="lazy" />
          </button>
        ))}
      </div>
      <h3>Code versions</h3>
      {versions?.length === 0 && <p className="muted small">Use Export ▸ Save code version to snapshot your code.</p>}
      <ul className="versions">
        {versions?.map((v) => (
          <VersionItem key={v.id} version={v} current={sketch.code} outputs={outputs?.filter((o) => o.code === v.code) ?? []} onRestore={() => onCode(v.code)} />
        ))}
      </ul>
    </div>
  );
}

function VersionItem({ version, current, outputs, onRestore }: { version: Version; current: string; outputs: Output[]; onRestore(): void }) {
  const [open, setOpen] = useState(false);
  // Shows what restoring would do to the current code.
  const diff = diffSummary(current, version.code);
  const same = diff.added === 0 && diff.removed === 0;
  return (
    <li className="version">
      <button className="version-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="version-title">
          <span>{version.message || "Untitled version"}</span>
          <span className="muted small">{new Date(version.createdAt).toLocaleString()}</span>
        </span>
        {same ? <span className="small muted">current</span> : <DiffStats added={diff.added} removed={diff.removed} />}
      </button>
      {open && (
        <div className="version-body">
          {outputs.length > 0 && (
            <div className="thumbs">
              {outputs.slice(0, 6).map((o) => <img key={o.id} className="thumb" src={o.url} alt={`Output with seed ${o.seed}`} loading="lazy" />)}
            </div>
          )}
          {same ? (
            <p className="small muted">Same as your current code.</p>
          ) : (
            <>
              <p className="small muted">Restoring changes your current code like this:</p>
              <DiffView lines={diff.lines} />
              <button onClick={() => confirm("Replace the current code with this version?") && onRestore()}>Restore this version</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

const PANES_KEY = "art-lab:pane-widths";

/** Desktop pane widths (code and side panel), draggable and remembered. */
function usePaneWidths(desktop: boolean) {
  const [w, setW] = useState<{ code: number; side: number }>(() => {
    try { return { code: 440, side: 340, ...JSON.parse(localStorage.getItem(PANES_KEY) ?? "{}") }; } catch { return { code: 440, side: 340 }; }
  });
  useEffect(() => {
    try { localStorage.setItem(PANES_KEY, JSON.stringify(w)); } catch { /* private mode */ }
  }, [w]);
  const drag = (side: "code" | "side", clientX: number) => {
    const total = window.innerWidth, minStage = 320;
    setW((cur) => side === "code"
      ? { ...cur, code: Math.round(Math.min(Math.max(280, clientX), total - cur.side - minStage)) }
      : { ...cur, side: Math.round(Math.min(Math.max(280, total - clientX), total - cur.code - minStage)) });
  };
  return {
    drag,
    style: desktop ? ({ gridTemplateColumns: `${w.code}px minmax(320px, 1fr) ${w.side}px`, "--code-w": `${w.code}px`, "--side-w": `${w.side}px` } as React.CSSProperties) : undefined,
  };
}

function PaneDivider({ side, onDrag }: { side: "code" | "side"; onDrag(side: "code" | "side", clientX: number): void }) {
  return (
    <div
      className={`pane-divider ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "code" ? "Resize the code pane" : "Resize the side panel"}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        document.body.classList.add("resizing");
      }}
      onPointerMove={(e) => e.buttons === 1 && onDrag(side, e.clientX)}
      onPointerUp={() => document.body.classList.remove("resizing")}
    />
  );
}
