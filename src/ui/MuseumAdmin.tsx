import { useEffect, useState } from "react";
import type { Output } from "../../shared/types";
import { COLLECTION_COLORS, MAIN_HALL, type LabCollection, type LabExhibit } from "../../shared/museum/manifest";
import { api } from "../lib/api";
import {
  MUSEUM_URL, createCollection, deleteCollection, listCollections, listExhibits, removeExhibit, updateCollection, updateExhibit,
} from "../lib/exhibit";
import { ExhibitDialog } from "./ExhibitDialog";

/**
 * What's in the public museum, by collection. Each collection has its own wing, themed in its color;
 * works without one hang in the main hall behind the atrium's stair.
 */
export function MuseumAdmin() {
  const [collections, setCollections] = useState<LabCollection[] | null>(null);
  const [exhibits, setExhibits] = useState<LabExhibit[]>([]);
  const [outputs, setOutputs] = useState<Map<string, Output>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LabExhibit | null>(null);
  const [newName, setNewName] = useState("");

  const reload = () =>
    Promise.all([listCollections(), listExhibits(), api<Output[]>("/outputs")]).then(([c, e, o]) => {
      setCollections(c);
      setExhibits(e);
      setOutputs(new Map(o.map((x) => [x.id, x])));
    }, () => setError("Couldn't load the museum."));
  useEffect(() => void reload(), []);

  const fail = (what: string) => () => setError(`Couldn't ${what}.`);
  const patchCollection = (id: string, patch: { name?: string; color?: string }) => {
    setCollections((list) => list?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? null);
    void updateCollection(id, patch).catch(fail("save the collection"));
  };
  const add = async () => {
    const name = newName.trim();
    if (!name || !collections) return;
    try {
      const c = await createCollection(name, COLLECTION_COLORS[(collections.length - 1) % COLLECTION_COLORS.length]);
      setCollections([...collections, c]);
      setNewName("");
    } catch {
      setError("Couldn't create the collection.");
    }
  };
  const remove = async (c: LabCollection) => {
    const n = exhibits.filter((e) => e.collection === c.id).length;
    if (!confirm(`Delete “${c.name}”?${n ? ` Its ${n} work${n === 1 ? "" : "s"} move to the main hall.` : ""}`)) return;
    await deleteCollection(c.id).catch(fail("delete the collection"));
    void reload();
  };
  const move = async (e: LabExhibit, collection: string) => {
    const updated = await updateExhibit(e.id, { ...e, collection: collection === MAIN_HALL ? null : collection }).catch(fail("move the work"));
    if (updated) setExhibits((list) => list.map((x) => (x.id === e.id ? updated : x)));
  };
  const takeDown = async (e: LabExhibit) => {
    if (!confirm(`Take “${e.title}” out of the museum? Later works in its wing move up one place.`)) return;
    await removeExhibit(e.id).catch(fail("take the work down"));
    setExhibits((list) => list.filter((x) => x.id !== e.id));
  };

  const worksIn = (c: LabCollection) => exhibits.filter((e) => (e.collection ?? MAIN_HALL) === c.id);

  return (
    <div className="home museum-admin">
      <div className="museum-head">
        <h2>Museum</h2>
        <a className="button" href={MUSEUM_URL} target="_blank" rel="noreferrer">Open the museum ↗</a>
      </div>
      <p className="muted">
        Each collection gets its own wing, lit in its theme color. Works without a collection hang in the main hall, behind
        the atrium's stair. Exhibit outputs from the <a href="#/gallery">Gallery</a>.
      </p>
      {error && <p className="danger">{error}</p>}
      {!collections && !error && <p className="muted">Loading…</p>}

      {collections && (
        <form className="new-collection" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input type="text" placeholder="New collection name" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="primary" disabled={!newName.trim()}>Add collection</button>
        </form>
      )}

      {collections?.map((c) => {
        const works = worksIn(c);
        return (
          <section key={c.id} className="collection-card" style={{ ["--theme" as string]: c.color }}>
            <header>
              <label className="theme-swatch" title="Theme color: the wing's light lines, glows and wall tint">
                <input type="color" value={c.color} onChange={(e) => patchCollection(c.id, { color: e.target.value })} />
              </label>
              <input
                type="text" className="collection-name" defaultValue={c.name} maxLength={60} aria-label="Collection name"
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== c.name) patchCollection(c.id, { name }); }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
              <span className="muted small">{c.id === MAIN_HALL ? "main hall · " : ""}{works.length} work{works.length === 1 ? "" : "s"}</span>
              <span className="spacer" />
              {c.id !== MAIN_HALL && <button className="link danger small" onClick={() => void remove(c)}>delete</button>}
            </header>
            {works.length === 0 ? (
              <p className="muted small">Nothing here yet.</p>
            ) : (
              <ul className="collection-works">
                {works.map((e) => {
                  const o = outputs.get(e.outputId);
                  return (
                    <li key={e.id}>
                      {o ? <img src={o.url} alt="" loading="lazy" /> : <span className="thumb-missing" />}
                      <span className="work-meta">
                        <strong>{e.title}</strong>
                        <span className="small muted">
                          {e.size.w} × {e.size.h} m{e.live ? " · live" : ""}{e.hero ? " · hero" : ""}
                        </span>
                      </span>
                      <select aria-label="Collection" value={e.collection ?? MAIN_HALL} onChange={(ev) => void move(e, ev.target.value)}>
                        {collections.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      {o && <button className="link small" onClick={() => setEditing(e)}>edit</button>}
                      <button className="link danger small" onClick={() => void takeDown(e)}>take down</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {editing && outputs.get(editing.outputId) && collections && (
        <ExhibitDialog
          output={outputs.get(editing.outputId)!}
          exhibit={editing}
          defaultTitle={editing.title}
          collections={collections}
          onCollection={(c) => setCollections((list) => (list ? [...list, c] : list))}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); void reload(); }}
        />
      )}
    </div>
  );
}
