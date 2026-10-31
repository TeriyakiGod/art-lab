import { useEffect, useRef, useState } from "react";
import type { Output } from "../../shared/types";
import {
  COLLECTION_COLORS, DEFAULT_LONG_SIDE, MAIN_HALL, MAX_STATEMENT, SIZE_PRESETS, physicalSize,
  type ExhibitInput, type LabCollection, type LabExhibit,
} from "../../shared/museum/manifest";
import { createCollection, exhibitOutput, removeExhibit, updateExhibit } from "../lib/exhibit";

type Props = {
  output: Output;
  /** Set when the output is already in the museum. */
  exhibit?: LabExhibit;
  defaultTitle: string;
  /** All collections, the main hall first. */
  collections: LabCollection[];
  /** A collection was made from this dialog. */
  onCollection?: (c: LabCollection) => void;
  onDone: (exhibit: LabExhibit | null) => void;
  onClose: () => void;
};

const NEW = "__new__";

/** Puts an output in the public museum, or edits or removes it. */
export function ExhibitDialog({ output, exhibit, defaultTitle, collections, onCollection, onDone, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ExhibitInput>(() =>
    exhibit
      ? { title: exhibit.title, statement: exhibit.statement, collection: exhibit.collection, hero: exhibit.hero, live: exhibit.live, longSide: exhibit.longSide }
      : { title: defaultTitle, statement: "", collection: null, hero: false, live: true, longSide: DEFAULT_LONG_SIDE },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => ref.current?.showModal(), []);

  const set = <K extends keyof ExhibitInput>(k: K, v: ExhibitInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const newCollection = async () => {
    const name = prompt("Name of the new collection")?.trim();
    if (!name) return;
    try {
      const color = COLLECTION_COLORS[(collections.length - 1) % COLLECTION_COLORS.length];
      const c = await createCollection(name, color);
      onCollection?.(c);
      set("collection", c.id);
    } catch {
      setError("Couldn't create the collection.");
    }
  };
  const size = physicalSize(output.width, output.height, form.longSide);
  const sizes = SIZE_PRESETS.some((p) => p.value === form.longSide)
    ? SIZE_PRESETS
    : [...SIZE_PRESETS, { label: `${form.longSide} m`, value: form.longSide }];

  const run = async (task: () => Promise<LabExhibit | null>) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await task());
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };
  const save = () => run(() => (exhibit ? updateExhibit(exhibit.id, form) : exhibitOutput(output, form)));
  const remove = () => {
    if (!exhibit || !confirm("Take this work out of the museum? Later works in its wing will move up one place.")) return;
    void run(async () => (await removeExhibit(exhibit.id), null));
  };

  return (
    <dialog ref={ref} className="exhibit-dialog" onClose={onClose}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h3>{exhibit ? "In the museum" : "Exhibit in the museum"}</h3>
        <img className="exhibit-preview" src={output.url} alt="" />

        <label>
          Title
          <input type="text" value={form.title} maxLength={120} required onChange={(e) => set("title", e.target.value)} />
        </label>
        <label>
          Collection
          <select
            value={form.collection ?? MAIN_HALL}
            onChange={(e) => {
              if (e.target.value === NEW) void newCollection();
              else set("collection", e.target.value === MAIN_HALL ? null : e.target.value);
            }}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.id === MAIN_HALL ? `${c.name} (no collection)` : c.name}</option>
            ))}
            <option value={NEW}>New collection…</option>
          </select>
          <span className="small muted">
            {form.collection ? "Hangs in this collection's own wing, in its colors." : "Hangs in the main hall, behind the atrium's stair."}
            {exhibit && form.collection !== exhibit.collection && " It moves to the end of that wing."}
          </span>
        </label>
        <label>
          Size on the wall
          <select value={form.longSide} onChange={(e) => set("longSide", Number(e.target.value))}>
            {sizes.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <span className="small muted">{size.w} × {size.h} m</span>
        </label>
        <label>
          Statement <span className="small muted">(optional)</span>
          <textarea value={form.statement} maxLength={MAX_STATEMENT} rows={3} onChange={(e) => set("statement", e.target.value)} />
        </label>
        <label className="exhibit-check">
          <input type="checkbox" checked={form.live} onChange={(e) => set("live", e.target.checked)} />
          <span>Run live and let guests re-roll the seed <span className="small muted">(shares the sketch's code)</span></span>
        </label>
        <label className="exhibit-check">
          <input type="checkbox" checked={form.hero} onChange={(e) => set("hero", e.target.checked)} />
          <span>Hero piece <span className="small muted">(can headline the atrium)</span></span>
        </label>

        {error && <p className="danger small">{error}</p>}
        <div className="exhibit-actions">
          {exhibit && <button type="button" className="link danger" disabled={busy} onClick={remove}>Remove from museum</button>}
          <span className="spacer" />
          <button type="button" disabled={busy} onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className="primary" disabled={busy || !form.title.trim()}>
            {busy ? "Saving…" : exhibit ? "Save" : "Exhibit"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
