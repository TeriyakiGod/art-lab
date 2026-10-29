import type { ParamSpec } from "../runtime/sandbox";

interface Props {
  specs: Record<string, ParamSpec>;
  values: Record<string, unknown>;
  onChange(id: string, value: unknown): void;
  onReset(id: string): void;
}

/** Big, thumb-friendly controls generated from the sketch's GenArtAPI param specs. */
export function ParamsPanel({ specs, values, onChange, onReset }: Props) {
  const entries = Object.entries(specs)
    .filter(([id]) => !id.startsWith("__"))
    .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0));
  if (!entries.length) {
    return <p className="muted pad">This sketch has no parameters yet. Declare some with <code>$genart.setParams()</code>, or ask the assistant to add some.</p>;
  }
  return (
    <div className="params">
      {entries.map(([id, spec]) => {
        const custom = Object.prototype.hasOwnProperty.call(values, id);
        const value = custom ? values[id] : spec.value;
        return (
          <div className="param" key={id}>
            <div className="param-head">
              <label htmlFor={`p-${id}`} title={spec.doc ?? spec.desc}>{spec.name}</label>
              <span className="param-value">{display(spec, value)}</span>
              {custom && <button className="link" onClick={() => onReset(id)} aria-label={`Reset ${spec.name}`}>reset</button>}
            </div>
            <Control id={id} spec={spec} value={value} onChange={(v) => onChange(id, v)} />
            {spec.desc && <div className="param-desc">{spec.desc}</div>}
          </div>
        );
      })}
    </div>
  );
}

function display(spec: ParamSpec, v: unknown) {
  if (spec.type === "range" && typeof v === "number") return +v.toFixed(4);
  if (spec.type === "toggle") return v ? "on" : "off";
  if (spec.type === "xy" && Array.isArray(v)) return v.map((n) => (+n).toFixed(2)).join(", ");
  if (spec.type === "choice") {
    const o = spec.options?.find((o) => (Array.isArray(o) ? o[0] : o) === v);
    return Array.isArray(o) ? o[1] : String(v ?? "");
  }
  return typeof v === "string" && v.length < 24 ? v : "";
}

function Control({ id, spec, value, onChange }: { id: string; spec: ParamSpec; value: unknown; onChange(v: unknown): void }) {
  const domId = `p-${id}`;
  switch (spec.type) {
    case "range":
      return (
        <input id={domId} type="range" min={spec.min ?? 0} max={spec.max ?? 100} step={spec.step ?? 1}
          value={Number(value ?? spec.min ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />
      );
    case "color":
      return <input id={domId} type="color" value={String(value ?? "#000000").slice(0, 7)} onChange={(e) => onChange(e.target.value)} />;
    case "toggle":
      return (
        <button id={domId} role="switch" aria-checked={!!value} className={`switch ${value ? "on" : ""}`} onClick={() => onChange(!value)}>
          <span />
        </button>
      );
    case "choice":
      return (
        <div className="chips" role="radiogroup" id={domId}>
          {spec.options?.map((o) => {
            const [v, label] = Array.isArray(o) ? o : [o, o];
            return (
              <button key={v} role="radio" aria-checked={v === value} className={`chip ${v === value ? "on" : ""}`} onClick={() => onChange(v)}>
                {label}
              </button>
            );
          })}
        </div>
      );
    case "xy": {
      const [x, y] = Array.isArray(value) ? (value as number[]) : [0.5, 0.5];
      return (
        <div className="xy">
          <input aria-label="x" type="range" min={0} max={1} step={0.01} value={x} onChange={(e) => onChange([Number(e.target.value), y])} />
          <input aria-label="y" type="range" min={0} max={1} step={0.01} value={y} onChange={(e) => onChange([x, Number(e.target.value)])} />
        </div>
      );
    }
    case "text":
      return <input id={domId} type="text" value={String(value ?? "")} maxLength={spec.maxLength} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <div className="muted small">“{spec.type}” params can't be edited here yet.</div>;
  }
}
