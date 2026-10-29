import { useEffect, useMemo, useState } from "react";
import type { Output, Sketch } from "../../shared/types";
import { api, json } from "../lib/api";
import { getSketch, listSketches, saveSketch } from "../lib/store";
import { createSketch } from "../lib/create";

/**
 * Opens an output in the studio with its exact code, seed and params. If the
 * sketch's code has changed since (or the sketch is gone), it opens as a new
 * sketch instead, so the current code is never overwritten.
 */
export async function openOutput(o: Output) {
  const s = await getSketch(o.sketchId);
  if (s && s.code === o.code && (s.engine ?? "canvas") === o.engine) {
    await saveSketch({ ...s, seed: o.seed, values: o.values, updatedAt: Date.now() });
    location.hash = `#/sketch/${s.id}`;
    return;
  }
  // Outputs are saved at 2× the sketch size.
  const size = (n: number) => Math.max(100, Math.round(n / 2));
  await createSketch({
    title: `${s?.title ?? "Saved output"} (seed ${o.seed})`,
    code: o.code,
    engine: o.engine,
    seed: o.seed,
    values: o.values,
    width: size(o.width),
    height: size(o.height),
  });
}

export function Gallery() {
  const [outputs, setOutputs] = useState<Output[] | null>(null);
  const [sketches, setSketches] = useState<Map<string, Sketch>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [sketchFilter, setSketchFilter] = useState("");

  useEffect(() => {
    api<Output[]>("/outputs").then(setOutputs, () =>
      setError(navigator.onLine ? "Couldn't load your outputs." : "You're offline, and the gallery hasn't been cached on this device yet."),
    );
    void listSketches().then((list) => setSketches(new Map(list.map((s) => [s.id, s]))));
  }, []);

  const sketchIds = useMemo(() => [...new Set(outputs?.map((o) => o.sketchId))], [outputs]);
  const shown = outputs?.filter((o) => (!favOnly || o.favorite) && (!sketchFilter || o.sketchId === sketchFilter));
  const titleOf = (id: string) => sketches.get(id)?.title ?? "Deleted sketch";

  const toggleFavorite = (o: Output) => {
    setOutputs((list) => list?.map((x) => (x.id === o.id ? { ...x, favorite: !o.favorite } : x)) ?? null);
    api(`/outputs/${o.id}`, json({ favorite: !o.favorite }, "PATCH")).catch(() =>
      setOutputs((list) => list?.map((x) => (x.id === o.id ? { ...x, favorite: o.favorite } : x)) ?? null),
    );
  };
  const remove = (o: Output) => {
    if (!confirm("Delete this output? The image is removed for good.")) return;
    setOutputs((list) => list?.filter((x) => x.id !== o.id) ?? null);
    void api(`/outputs/${o.id}`, { method: "DELETE" }).catch(() => setError("Couldn't delete that output."));
  };

  return (
    <div className="home gallery">
      <h2>Gallery</h2>
      <div className="gallery-filters">
        <div className="chips" role="group" aria-label="Show">
          <button className={`chip ${!favOnly ? "on" : ""}`} aria-pressed={!favOnly} onClick={() => setFavOnly(false)}>All</button>
          <button className={`chip ${favOnly ? "on" : ""}`} aria-pressed={favOnly} onClick={() => setFavOnly(true)}>★ Favorites</button>
        </div>
        {sketchIds.length > 1 && (
          <select aria-label="Sketch" value={sketchFilter} onChange={(e) => setSketchFilter(e.target.value)}>
            <option value="">All sketches</option>
            {sketchIds.map((id) => <option key={id} value={id}>{titleOf(id)}</option>)}
          </select>
        )}
      </div>

      {error && <p className="muted">{error}</p>}
      {!error && !outputs && <p className="muted">Loading…</p>}
      {outputs?.length === 0 && <p className="muted">No outputs yet. In a sketch, press ★ Save to keep a seed and params you like.</p>}
      {outputs && outputs.length > 0 && shown?.length === 0 && <p className="muted">Nothing matches. Star outputs to see them here.</p>}

      <div className="gallery-grid">
        {shown?.map((o) => (
          <figure key={o.id} className="output-card">
            <button className="output-open" onClick={() => void openOutput(o)} title="Open in the studio with this seed and these params">
              <img src={o.url} alt={`${titleOf(o.sketchId)}, seed ${o.seed}`} loading="lazy" />
            </button>
            <figcaption>
              <span className="output-meta">
                <strong>{titleOf(o.sketchId)}</strong>
                <span className="small muted">seed {o.seed} · {new Date(o.createdAt).toLocaleDateString()}</span>
              </span>
              <button
                className={`star ${o.favorite ? "on" : ""}`}
                aria-pressed={o.favorite}
                aria-label={o.favorite ? "Remove from favorites" : "Add to favorites"}
                onClick={() => toggleFavorite(o)}
              >
                {o.favorite ? "★" : "☆"}
              </button>
              <button className="link danger small" onClick={() => remove(o)}>delete</button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
