import { useEffect, useState } from "react";
import { MAIN_HALL, type Manifest } from "../../../shared/museum/manifest";

/**
 * The collection as a plain page: for screen readers, for browsers that can't show the 3D museum,
 * and for anyone who'd rather browse. Each work links to its place in the museum.
 */
export function ListView({ unsupported = false }: { unsupported?: boolean }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    document.title = "Museum · the collection";
    fetch("/api/manifest").then((r) => (r.ok ? (r.json() as Promise<Manifest>) : Promise.reject())).then(setManifest, () => setError(true));
  }, []);

  const groups = manifest
    ? manifest.collections
      .map((c) => ({ ...c, works: manifest.exhibits.filter((e) => (e.collection ?? MAIN_HALL) === c.id) }))
      .filter((g) => g.works.length)
    : [];

  return (
    <main className="list-page">
      <header>
        <h1>Museum</h1>
        <p className="muted">A museum of algorithmic art. Every work is a program: run it again with a new seed in the museum to see a version nobody has seen before.</p>
        {unsupported ? (
          <p className="notice">This browser can't show the 3D museum, so here is the collection as a list.</p>
        ) : (
          <p><a className="button" href="/">Enter the 3D museum</a></p>
        )}
      </header>
      {error && <p className="muted">Couldn't load the collection.</p>}
      {!manifest && !error && <p className="muted">Loading…</p>}
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`c-${g.id}`}>
          <h2 id={`c-${g.id}`} style={{ borderColor: g.color }}>{g.name}</h2>
          <ul className="list-works">
            {g.works.map((e) => (
              <li key={e.id}>
                <figure>
                  <img src={e.images["1k"]} alt={e.title} loading="lazy" width={e.size.w > e.size.h ? 400 : Math.round((400 * e.size.w) / e.size.h)} />
                  <figcaption>
                    <h3>{e.title}</h3>
                    <p className="muted small">{g.name} · {new Date(e.createdAt).getFullYear()} · {e.size.w} × {e.size.h} m</p>
                    {e.statement && <p>{e.statement}</p>}
                    <p className="muted small">
                      Seed <code>{e.seed}</code> · {e.engine === "p5" ? "p5.js" : "Canvas"}{e.live ? " · live" : ""}{e.animated ? " · animated" : ""}
                    </p>
                    {!unsupported && <a href={`/#/w/${e.id}`}>See it in the museum →</a>}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
