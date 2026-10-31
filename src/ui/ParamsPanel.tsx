import { useState } from "react";
import type { ParamSpec } from "../runtime/sandbox";
import { addParam, hasParamsBlock, isValidParamId, PARAM_KINDS, paramIdFor, removeParam, updateParam, usesParam, type ParamKind, type SpecFields } from "../lib/paramCode";

interface Props {
  specs: Record<string, ParamSpec>;
  values: Record<string, unknown>;
  onChange(id: string, value: unknown): void;
  onReset(id: string): void;
  /** The editor's code, which adding and editing params rewrites. */
  code: string;
  onCode(code: string): void;
}

/** Big, thumb-friendly controls generated from the sketch's GenArtAPI param specs. */
export function ParamsPanel({ specs, values, onChange, onReset, code, onCode }: Props) {
  const [editing, setEditing] = useState<string | null>(null); // a param id, or "+" for a new one
  const [added, setAdded] = useState<string | null>(null);
  const entries = Object.entries(specs)
    .filter(([id]) => !id.startsWith("__"))
    .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0));

  const save = (next: string | null, id: string, dropValue: boolean) => {
    if (!next) return alert("Couldn't find this param in the code. Edit it in the Code tab instead.");
    onCode(next);
    if (dropValue && Object.prototype.hasOwnProperty.call(values, id)) onReset(id);
    setEditing(null);
  };

  return (
    <div className="params">
      {!entries.length && editing !== "+" && (
        <p className="muted">This sketch has no parameters yet. Add one below, or ask the assistant to add some.</p>
      )}
      {entries.map(([id, spec]) => {
        const custom = Object.prototype.hasOwnProperty.call(values, id);
        const value = custom ? values[id] : spec.value;
        return (
          <div className="param" key={id}>
            <div className="param-head">
              <label htmlFor={`p-${id}`} title={spec.doc ?? spec.desc}>{spec.name}</label>
              <span className="param-value">{display(spec, value)}</span>
              {custom && <button className="link" onClick={() => onReset(id)} aria-label={`Reset ${spec.name}`}>reset</button>}
              <button className="link param-edit" onClick={() => setEditing(editing === id ? null : id)} aria-label={`Edit ${spec.name}`} aria-expanded={editing === id}>edit</button>
            </div>
            <Control id={id} spec={spec} value={value} onChange={(v) => onChange(id, v)} />
            {spec.desc && <div className="param-desc">{spec.desc}</div>}
            {added === id && (
              <div className="param-hint small">
                Use it in your code: <code>param("{id}")</code>
                <button className="link" onClick={() => void navigator.clipboard?.writeText(`param("${id}")`)}>copy</button>
                <button className="link" onClick={() => setAdded(null)} aria-label="Dismiss">✕</button>
              </div>
            )}
            {editing === id && (
              <ParamEditor
                id={id}
                spec={spec}
                taken={Object.keys(specs)}
                onCancel={() => setEditing(null)}
                onSave={(_, fields) => {
                  const v = custom ? values[id] : undefined;
                  const out = typeof v === "number" && ((fields.min !== undefined && v < Number(fields.min)) || (fields.max !== undefined && v > Number(fields.max)));
                  save(updateParam(code, id, fields), id, out);
                }}
                onRemove={() => {
                  const msg = usesParam(code, id)
                    ? `Remove “${spec.name}”? Your code still reads param("${id}"), so the sketch will show an error until you remove that too.`
                    : `Remove “${spec.name}”?`;
                  if (confirm(msg)) save(removeParam(code, id), id, true);
                }}
              />
            )}
          </div>
        );
      })}
      {editing === "+" ? (
        <ParamEditor
          taken={Object.keys(specs)}
          onCancel={() => setEditing(null)}
          onSave={(id, fields, kind) => {
            const next = addParam(code, id, kind, fields);
            save(next, id, false);
            if (next) setAdded(id);
          }}
        />
      ) : hasParamsBlock(code) ? (
        <button className="param-add" onClick={() => setEditing("+")}>+ Add parameter</button>
      ) : (
        <p className="muted small">To add parameters here, the code needs a <code>const param = await $genart.setParams({"{}"})</code> line near the top.</p>
      )}
    </div>
  );
}

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Options as typed: "a, b" or "value=Label, …". */
const parseOptions = (s: string): (string | [string, string])[] =>
  s.split(",").map((o) => o.trim()).filter(Boolean).map((o) => {
    const i = o.indexOf("=");
    return i > 0 ? [o.slice(0, i).trim(), o.slice(i + 1).trim()] as [string, string] : o;
  });
const optionsText = (opts: ParamSpec["options"]) => (opts ?? []).map((o) => (Array.isArray(o) ? (o[0] === o[1] ? o[0] : `${o[0]}=${o[1]}`) : o)).join(", ");
const optionValue = (o: string | [string, string]) => (Array.isArray(o) ? o[0] : o);

/** Form for a new param (no `spec`) or for changing an existing one. */
function ParamEditor(props: {
  id?: string;
  spec?: ParamSpec;
  taken: string[];
  onSave(id: string, fields: SpecFields, kind: ParamKind): void;
  onCancel(): void;
  onRemove?(): void;
}) {
  const { spec } = props;
  const isNew = !spec;
  const [kind, setKind] = useState<ParamKind>(() => (spec?.type as ParamKind) ?? "range");
  const editable = isNew || PARAM_KINDS.some(([k]) => k === spec.type);
  const [name, setName] = useState(spec?.name ?? "");
  const [id, setId] = useState(props.id ?? "");
  const [idTouched, setIdTouched] = useState(false);
  const [desc, setDesc] = useState(spec?.desc ?? "");
  const [min, setMin] = useState(str(spec?.min ?? (isNew ? 0 : "")));
  const [max, setMax] = useState(str(spec?.max ?? (isNew ? 100 : "")));
  const [step, setStep] = useState(str(spec?.step ?? (isNew ? 1 : "")));
  const [def, setDef] = useState<unknown>(spec ? spec.default : undefined);
  const [options, setOptions] = useState(optionsText(spec?.options) || (isNew ? "one, two, three" : ""));

  const finalId = isNew ? (idTouched ? id : paramIdFor(name || "param", props.taken)) : props.id!;
  const opts = parseOptions(options);
  const defaults: Record<ParamKind, unknown> = { range: num(min) ?? 0, color: "#e4572e", toggle: false, choice: opts[0] && optionValue(opts[0]) };
  const value = def ?? (isNew ? defaults[kind] : undefined);

  let error = "";
  if (!name.trim()) error = "Give it a name.";
  else if (isNew && !isValidParamId(finalId)) error = "The code name can only use letters, digits and _, and can't start with a digit.";
  else if (isNew && props.taken.includes(finalId)) error = `There's already a param called "${finalId}".`;
  else if (kind === "range" && editable) {
    const lo = num(min) ?? 0, hi = num(max) ?? 100, st = num(step) ?? 1;
    if ([lo, hi, st].some(Number.isNaN)) error = "Min, max and step must be numbers.";
    else if (lo >= hi) error = "Min must be less than max.";
    else if (st <= 0) error = "Step must be more than 0.";
    else if (typeof value === "number" && (value < lo || value > hi)) error = "The default must be between min and max.";
  } else if (kind === "choice" && editable && opts.length < 2) error = "Add at least two options, separated by commas.";

  const submit = () => {
    if (error) return;
    const fields: SpecFields = {};
    const set = (k: string, v: SpecFields[string], old: unknown) => {
      if (isNew ? v !== undefined && v !== "" : JSON.stringify(v ?? null) !== JSON.stringify(old ?? null)) fields[k] = v;
    };
    set("name", name.trim(), spec?.name);
    set("desc", desc.trim() || undefined, spec?.desc);
    if (editable && kind === "range") {
      set("min", num(min), spec?.min);
      set("max", num(max), spec?.max);
      set("step", num(step), spec?.step);
    }
    if (editable && kind === "choice") set("options", opts, spec?.options);
    if (editable) {
      let d = value as SpecFields[string];
      if (kind === "choice" && !opts.some((o) => optionValue(o) === d)) d = optionValue(opts[0]);
      set("default", d, spec?.default);
    }
    props.onSave(finalId, fields, kind);
  };

  return (
    <form className="param-editor" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {isNew && (
        <div className="chips" role="radiogroup" aria-label="Type">
          {PARAM_KINDS.map(([k, label]) => (
            <button type="button" key={k} role="radio" aria-checked={kind === k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => { setKind(k); setDef(undefined); }}>{label}</button>
          ))}
        </div>
      )}
      <label>Name<input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Line width" /></label>
      <label>Description<input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional help text" /></label>
      {editable && kind === "range" && (
        <div className="param-editor-grid">
          <label>Min<input type="number" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></label>
          <label>Max<input type="number" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></label>
          <label>Step<input type="number" inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} /></label>
          <label>Default<input type="number" inputMode="decimal" value={str(value)} placeholder="random" onChange={(e) => setDef(num(e.target.value))} /></label>
        </div>
      )}
      {editable && kind === "color" && (
        <label>Default<input type="color" value={String(value ?? "#000000").slice(0, 7)} onChange={(e) => setDef(e.target.value)} /></label>
      )}
      {editable && kind === "toggle" && (
        <label className="row">Starts on
          <button type="button" role="switch" aria-checked={!!value} className={`switch ${value ? "on" : ""}`} onClick={() => setDef(!value)}><span /></button>
        </label>
      )}
      {editable && kind === "choice" && (
        <>
          <label>Options<input type="text" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="dots, lines, both" /></label>
          <label>Default
            <select value={String(value ?? "")} onChange={(e) => setDef(e.target.value)}>
              {opts.map((o) => <option key={optionValue(o)} value={optionValue(o)}>{Array.isArray(o) ? o[1] : o}</option>)}
            </select>
          </label>
        </>
      )}
      {!editable && <p className="muted small">Only the name and description of “{spec!.type}” params can be changed here.</p>}
      {isNew ? (
        <label>Name in code
          <input type="text" value={finalId} spellCheck={false} onChange={(e) => { setId(e.target.value); setIdTouched(true); }} />
        </label>
      ) : (
        <p className="muted small">In code: <code>param("{finalId}")</code></p>
      )}
      {error && name.trim() && <p className="error small">{error}</p>}
      <div className="row wrap">
        <button type="submit" className="primary" disabled={!!error}>{isNew ? "Add" : "Save"}</button>
        <button type="button" onClick={props.onCancel}>Cancel</button>
        {props.onRemove && <button type="button" className="link danger" onClick={props.onRemove}>Remove</button>}
      </div>
    </form>
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
