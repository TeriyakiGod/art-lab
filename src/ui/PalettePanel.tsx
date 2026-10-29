import { useEffect, useState } from "react";
import type { Palette } from "../../shared/types";
import { MAX_PALETTE_COLORS, STARTER_PALETTES } from "../../shared/palettes";
import { deletePalette, listPalettes, savePalette, subscribePalettes } from "../lib/palettes";

const same = (a: string[] | undefined, b: string[]) => !!a && a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i].toLowerCase());

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="swatches" aria-hidden>
      {colors.map((c, i) => <span key={i} style={{ background: c }} />)}
    </span>
  );
}

/**
 * Picks the sketch's active palette (read in code with `lab.palette()`),
 * edits its colors live, and saves palettes for reuse across sketches.
 */
export function PalettePanel({ active, onChange }: { active?: string[]; onChange(colors: string[] | undefined): void }) {
  const [mine, setMine] = useState<Palette[]>([]);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const load = () => void listPalettes().then(setMine);
    load();
    return subscribePalettes(load);
  }, []);

  const all = [...mine, ...STARTER_PALETTES];
  const current = all.find((p) => same(active, p.colors));
  const setColor = (i: number, c: string) => active && onChange(active.map((x, j) => (j === i ? c : x)));

  return (
    <div className="palette-panel">
      <div className="row palette-head">
        <h3>Palette</h3>
        <span className="small muted">{active ? current?.name ?? "Custom" : "None"}</span>
      </div>
      <p className="small muted">Sketches use it through <code>lab.palette()</code>. Pick one to try it on this sketch.</p>

      {active && (
        <div className="palette-active">
          {editing ? (
            <div className="palette-edit">
              {active.map((c, i) => (
                <span key={i} className="palette-color">
                  <input type="color" value={c} aria-label={`Color ${i + 1}`} onChange={(e) => setColor(i, e.target.value)} />
                  {active.length > 1 && (
                    <button className="link" aria-label={`Remove color ${i + 1}`} onClick={() => onChange(active.filter((_, j) => j !== i))}>×</button>
                  )}
                </span>
              ))}
              {active.length < MAX_PALETTE_COLORS && (
                <button className="icon" aria-label="Add a color" onClick={() => onChange([...active, active.at(-1) ?? "#888888"])}>+</button>
              )}
            </div>
          ) : (
            <Swatches colors={active} />
          )}
          <div className="row">
            <button className="link" onClick={() => setEditing(!editing)}>{editing ? "done" : "edit colors"}</button>
            {!current && (
              <button
                className="link"
                onClick={() => {
                  const name = prompt("Name this palette")?.trim();
                  if (name) void savePalette({ name, colors: active });
                }}
              >
                save as palette…
              </button>
            )}
            <button className="link" onClick={() => onChange(undefined)}>remove</button>
          </div>
        </div>
      )}

      <ul className="palette-list">
        {all.map((p) => (
          <li key={p.id} className={current?.id === p.id ? "on" : ""}>
            <button className="palette-pick" onClick={() => onChange(p.colors)} aria-pressed={current?.id === p.id}>
              <Swatches colors={p.colors} />
              <span className="small">{p.name}</span>
            </button>
            {!p.id.startsWith("starter:") && (
              <button className="link danger small" onClick={() => confirm(`Delete the palette “${p.name}”?`) && void deletePalette(p.id)}>delete</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
