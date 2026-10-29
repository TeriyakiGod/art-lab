import { useCallback, useEffect, useRef, useState } from "react";
import type { Output, Sketch, Version } from "../../shared/types";
import { SketchFrame, renderToPNG, type SketchFrameHandle } from "../runtime/SketchFrame";
import type { ParamSpec } from "../runtime/sandbox";
import { api, json } from "../lib/api";
import { ensureSynced, getSketch, randomSeed, saveSketch } from "../lib/store";
import { Editor } from "./Editor";
import { ParamsPanel } from "./ParamsPanel";
import { SeedBar } from "./SeedBar";
import { ChatPanel } from "./ChatPanel";

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
      const blob = await renderToPNG({ code: sketch.code, seed: sketch.seed, values: sketch.values, width: sketch.width, height: sketch.height, scale });
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
      const blob = await renderToPNG({ code: sketch.code, seed: sketch.seed, values: sketch.values, width: sketch.width, height: sketch.height, scale: 2 });
      const form = new FormData();
      form.set("image", new File([blob], "output.png", { type: "image/png" }));
      form.set("meta", JSON.stringify({ sketchId: sketch.id, code: sketch.code, seed: sketch.seed, values: sketch.values, width: sketch.width * 2, height: sketch.height * 2 }));
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

  // Horizontal swipe on the canvas = next / previous seed (mobile).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY });
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) dx < 0 ? setSeed(randomSeed()) : backSeed();
  };

  const tweak = (
    <ParamsPanel
      specs={specs}
      values={sketch.values}
      onChange={(id, v) => update({ values: { ...sketch.values, [id]: v } })}
      onReset={(id) => {
        const { [id]: _, ...rest } = sketch.values;
        update({ values: rest });
      }}
    />
  );
  const chat = (
    <ChatPanel
      userId={userId}
      sketch={sketch}
      errors={errors}
      onApplyCode={applyCode}
      onSetParams={(values) => update({ values: { ...sketch.values, ...values } })}
    />
  );

  return (
    <div className={`studio ${desktop ? "desktop" : `mobile tab-${tab}`}`}>
      <section className="pane code-pane">
        <div className="pane-bar">
          <input className="title-input" aria-label="Sketch title" value={sketch.title} onChange={(e) => update({ title: e.target.value })} />
          <label className="small row" title="Run automatically while typing">
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} /> auto-run
          </label>
          {!autoRun && <button onClick={() => update({ code: draft })} title="Ctrl/Cmd + Enter">Run ▶</button>}
        </div>
        <Editor value={draft} onChange={setDraft} />
        <Console errors={errors} logs={logs} onClear={() => setLogs([])} />
      </section>

      <section className="pane stage-pane">
        <div className="stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <SketchFrame
            ref={frame}
            className="stage-frame"
            code={sketch.code}
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
        {!desktop && errors.length > 0 && <div className="stage-error" role="alert">{errors.at(-1)}</div>}
        <div className="stage-bar">
          <SeedBar seed={sketch.seed} history={seedHistory} onSeed={setSeed} onBack={backSeed} />
          <div className="row">
            <button onClick={saveOutput} disabled={!!busy} title="Save this seed + params as an output">★ Save</button>
            <ExportMenu disabled={!!busy} onExport={exportPNG} onVersion={saveVersion} />
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
    </div>
  );
}

function ExportMenu({ disabled, onExport, onVersion }: { disabled: boolean; onExport(scale: number): void; onVersion(): void }) {
  return (
    <details className="menu">
      <summary aria-disabled={disabled}>Export ▾</summary>
      <div className="menu-list">
        {[1, 2, 4].map((s) => <button key={s} disabled={disabled} onClick={() => onExport(s)}>PNG {s}×</button>)}
        <button onClick={onVersion}>Save code version…</button>
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
          <li key={v.id}>
            <span>{v.message || "Untitled version"}</span>
            <span className="muted small">{new Date(v.createdAt).toLocaleString()}</span>
            <button className="link" onClick={() => confirm("Replace the current code with this version?") && onCode(v.code)}>restore</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
