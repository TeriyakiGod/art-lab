import { useEffect, useRef, useState } from "react";
import type { Sketch } from "../../shared/types";
import { renderToPNG } from "../runtime/SketchFrame";
import type { ParamSpec } from "../runtime/sandbox";
import { randomSeed } from "../lib/store";

const COUNT = 16;
const THUMB = 240; // px, longest side
const PARALLEL = 4;

interface Variant {
  seed: string;
  values: Record<string, unknown>;
  url?: string;
  failed?: boolean;
}

/** A random value inside a param's range, for the params a beginner can sensibly shuffle. */
function randomValue(spec: ParamSpec): unknown {
  switch (spec.type) {
    case "range": {
      const min = spec.min ?? 0, max = spec.max ?? 1, step = spec.step ?? 0;
      const v = min + Math.random() * (max - min);
      return step ? Math.min(max, min + Math.round((v - min) / step) * step) : v;
    }
    case "toggle":
      return Math.random() < 0.5;
    case "choice": {
      const opts = spec.options ?? [];
      const o = opts[Math.floor(Math.random() * opts.length)];
      return Array.isArray(o) ? o[0] : o;
    }
    default:
      return undefined;
  }
}

function makeVariants(sketch: Sketch, specs: Record<string, ParamSpec>, withParams: boolean): Variant[] {
  return Array.from({ length: COUNT }, () => {
    const values = { ...sketch.values };
    if (withParams) {
      for (const [id, spec] of Object.entries(specs)) {
        const v = randomValue(spec);
        if (v !== undefined) values[id] = v;
      }
    }
    return { seed: randomSeed(), values };
  });
}

/** A grid of seeded variations of the current sketch; picking one adopts its seed (and params). */
export function Variations(props: {
  sketch: Sketch;
  specs: Record<string, ParamSpec>;
  onPick(v: { seed: string; values: Record<string, unknown> }): void;
  onClose(): void;
}) {
  const { sketch, specs } = props;
  const [withParams, setWithParams] = useState(false);
  const [variants, setVariants] = useState<Variant[]>(() => makeVariants(sketch, specs, false));
  const urls = useRef<string[]>([]);

  // Render a few at a time; a new batch (shuffle) abandons the old one.
  useEffect(() => {
    let live = true;
    const queue = variants.map((v, i) => [v, i] as const);
    const scale = THUMB / Math.max(sketch.width, sketch.height);
    const worker = async () => {
      for (let job = queue.shift(); job && live; job = queue.shift()) {
        const [v, i] = job;
        let patch: Partial<Variant>;
        try {
          const blob = await renderToPNG({ code: sketch.code, engine: sketch.engine, seed: v.seed, values: v.values, width: sketch.width, height: sketch.height, scale });
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          patch = { url };
        } catch {
          patch = { failed: true };
        }
        if (live) setVariants((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      }
    };
    void Promise.all(Array.from({ length: PARALLEL }, worker));
    return () => { live = false; };
    // Only a new batch restarts rendering; filling in thumbnails must not.
  }, [variants.map((v) => v.seed).join()]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const shuffle = (params = withParams) => setVariants(makeVariants(sketch, specs, params));
  const canVaryParams = Object.values(specs).some((s) => randomValue(s) !== undefined);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Variations" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="overlay-panel variations">
        <div className="overlay-head">
          <strong>Variations</strong>
          <span className="small muted">Tap one to use it</span>
          <span className="spacer" />
          {canVaryParams && (
            <label className="small row" title="Also shuffle sliders, toggles and choices">
              <input
                type="checkbox"
                checked={withParams}
                onChange={(e) => {
                  setWithParams(e.target.checked);
                  shuffle(e.target.checked);
                }}
              />
              vary params
            </label>
          )}
          <button onClick={() => shuffle()}>Shuffle</button>
          <button className="link" onClick={props.onClose} aria-label="Close">✕</button>
        </div>
        <div className="variation-grid">
          {variants.map((v) => (
            <button key={v.seed} className="variation" onClick={() => props.onPick(v)} title={`Seed ${v.seed}`} disabled={!v.url}>
              {v.url ? <img src={v.url} alt={`Variation with seed ${v.seed}`} /> : <span className="small muted">{v.failed ? "failed" : "…"}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
