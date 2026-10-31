import { useEffect, useRef, useState } from "react";
import type { Output } from "../../shared/types";
import {
  DEFAULT_LONG_SIDE, DEFAULT_WING, MAX_STATEMENT, SIZE_PRESETS, physicalSize,
  type ExhibitInput, type LabExhibit,
} from "../../shared/museum/manifest";
import { exhibitOutput, removeExhibit, updateExhibit } from "../lib/exhibit";

type Props = {
  output: Output;
  /** Set when the output is already in the museum. */
  exhibit?: LabExhibit;
  defaultTitle: string;
  /** Wings already in use, for suggestions. */
  wings: string[];
  onDone: (exhibit: LabExhibit | null) => void;
  onClose: () => void;
};

/** Puts an output in the public museum, or edits or removes it. */
export function ExhibitDialog({ output, exhibit, defaultTitle, wings, onDone, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ExhibitInput>(() =>
    exhibit
      ? { title: exhibit.title, statement: exhibit.statement, wing: exhibit.wing, hero: exhibit.hero, live: exhibit.live, longSide: exhibit.longSide }
      : { title: defaultTitle, statement: "", wing: wings[0] ?? DEFAULT_WING, hero: false, live: true, longSide: DEFAULT_LONG_SIDE },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => ref.current?.showModal(), []);

  const set = <K extends keyof ExhibitInput>(k: K, v: ExhibitInput[K]) => setForm((f) => ({ ...f, [k]: v }));
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
          Wing
          <input type="text" value={form.wing} maxLength={60} list="exhibit-wings" onChange={(e) => set("wing", e.target.value)} />
          <datalist id="exhibit-wings">{wings.map((w) => <option key={w} value={w} />)}</datalist>
          {exhibit && form.wing.trim() !== exhibit.wing && <span className="small muted">Moves to the end of “{form.wing.trim() || DEFAULT_WING}”.</span>}
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
