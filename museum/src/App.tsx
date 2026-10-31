import { useEffect, useState } from "react";
import type { Manifest } from "../../shared/museum/manifest";

/** Phase 0 placeholder: lists the collection the 3D museum will be generated from. */
export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : Promise.reject()))
      .then(setManifest, () => setError(true));
  }, []);

  const wings = manifest ? [...new Set(manifest.exhibits.map((e) => e.wing))] : [];

  return (
    <main>
      <header>
        <h1>Museum</h1>
        <p className="muted">A walkable museum of algorithmic art. The building is under construction.</p>
      </header>
      {error && <p className="muted">Couldn't load the collection.</p>}
      {manifest?.exhibits.length === 0 && <p className="muted">Nothing exhibited yet.</p>}
      {wings.map((wing) => (
        <section key={wing}>
          <h2>{wing}</h2>
          <div className="grid">
            {manifest!.exhibits.filter((e) => e.wing === wing).map((e) => (
              <figure key={e.id}>
                <img src={e.images["1k"]} alt={e.title} loading="lazy" />
                <figcaption>
                  <strong>{e.title}</strong>
                  <span className="muted">
                    {e.size.w} × {e.size.h} m · seed {e.seed}{e.animated ? " · animated" : ""}{e.live ? " · live" : ""}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
