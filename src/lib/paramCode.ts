import { parser } from "@lezer/javascript";
import type { SyntaxNode } from "@lezer/common";

/**
 * Reads and rewrites the param specs inside a sketch's `$genart.setParams({ ... })`,
 * so the Tweak panel can add and edit params without the user touching the code.
 * Only the parts that change are rewritten; everything else keeps its formatting.
 */

export type ParamKind = "range" | "color" | "toggle" | "choice";
export const PARAM_KINDS: [ParamKind, string][] = [["range", "Slider"], ["color", "Color"], ["toggle", "On/off"], ["choice", "Choice"]];

/** Spec fields as JS values; `undefined` leaves a field out. */
export type SpecFields = Record<string, string | number | boolean | (string | [string, string])[] | undefined>;

interface Prop { key: string; node: SyntaxNode; value: SyntaxNode }
interface Edit { from: number; to: number; insert: string }

const keyOf = (code: string, n: SyntaxNode | null) => {
  if (!n) return undefined;
  const t = code.slice(n.from, n.to);
  if (n.name === "PropertyDefinition" || n.name === "PropertyName") return t;
  if (n.name === "String") return t.slice(1, -1);
  return undefined;
};

/** `key: value` properties of an object literal. */
function props(code: string, obj: SyntaxNode): Prop[] {
  const out: Prop[] = [];
  for (let c = obj.firstChild; c; c = c.nextSibling) {
    if (c.name !== "Property") continue;
    const key = keyOf(code, c.firstChild);
    const value = c.lastChild;
    if (key !== undefined && value && value !== c.firstChild) out.push({ key, node: c, value });
  }
  return out;
}

const firstObjectArg = (call: SyntaxNode) => call.getChild("ArgList")?.getChild("ObjectExpression") ?? null;

/** The object literal passed to `$genart.setParams(...)`, if any. */
function paramsObject(code: string): SyntaxNode | null {
  const tree = parser.parse(code);
  let found: SyntaxNode | null = null;
  tree.iterate({
    enter(n) {
      if (found) return false;
      if (n.name !== "CallExpression") return;
      const callee = n.node.firstChild;
      if (callee && /^\$genart\s*\.\s*setParams$/.test(code.slice(callee.from, callee.to))) {
        found = firstObjectArg(n.node);
        return false;
      }
    },
  });
  return found;
}

/** The spec object of param `id` (the `{...}` inside `$genart.params.x(...)`). */
function specObject(code: string, id: string) {
  const obj = paramsObject(code);
  const prop = obj && props(code, obj).find((p) => p.key === id);
  if (!prop || prop.value.name !== "CallExpression") return null;
  const spec = firstObjectArg(prop.value);
  return spec ? { obj: obj!, prop, spec } : null;
}

export const hasParamsBlock = (code: string) => paramsObject(code) !== null;

const lit = (v: NonNullable<SpecFields[string]>): string =>
  Array.isArray(v) ? `[${v.map((x) => (Array.isArray(x) ? `[${x.map((s) => JSON.stringify(s)).join(", ")}]` : JSON.stringify(x))).join(", ")}]` : JSON.stringify(v);

const fieldsText = (f: SpecFields) =>
  Object.entries(f).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}: ${lit(v!)}`).join(", ");

function apply(code: string, edits: Edit[]) {
  for (const e of [...edits].sort((a, b) => b.from - a.from)) code = code.slice(0, e.from) + e.insert + code.slice(e.to);
  return code;
}

const indentAt = (code: string, pos: number) => code.slice(code.lastIndexOf("\n", pos - 1) + 1, pos).match(/^\s*/)![0];

/** Adds `id: $genart.params.kind({...}),` as the last param. Returns null if there's no setParams({...}). */
export function addParam(code: string, id: string, kind: ParamKind, fields: SpecFields): string | null {
  const obj = paramsObject(code);
  if (!obj) return null;
  const line = `${id}: $genart.params.${kind}({ ${fieldsText(fields)} }),`;
  const list = props(code, obj);
  const close = obj.to - 1; // the "}"
  const last = list.at(-1);
  if (!last) {
    const base = indentAt(code, obj.from);
    return apply(code, [{ from: obj.from, to: obj.to, insert: `{\n${base}  ${line}\n${base}}` }]);
  }
  const indent = indentAt(code, last.node.from) || "  ";
  // Keep a comma after the previous last param.
  const after = code.slice(last.node.to, close);
  const comma = /^\s*,/.test(after) ? "" : ",";
  const commaEnd = last.node.to + (comma ? 0 : after.indexOf(",") + 1);
  return apply(code, [{ from: commaEnd, to: commaEnd, insert: `${comma}\n${indent}${line}` }]);
}

/** Changes fields of param `id`'s spec in place; `undefined` removes a field. */
export function updateParam(code: string, id: string, fields: SpecFields): string | null {
  const found = specObject(code, id);
  if (!found) return null;
  const existing = props(code, found.spec);
  const edits: Edit[] = [];
  const added: SpecFields = {};
  for (const [k, v] of Object.entries(fields)) {
    const p = existing.find((e) => e.key === k);
    if (v === undefined || v === "") {
      // Remove "key: value" plus one neighbouring comma.
      if (!p) continue;
      const rest = code.slice(p.node.to);
      const m = rest.match(/^\s*,\s*/);
      if (m) edits.push({ from: p.node.from, to: p.node.to + m[0].length, insert: "" });
      else {
        const before = code.slice(0, p.node.from).match(/,\s*$/);
        edits.push({ from: p.node.from - (before ? before[0].length : 0), to: p.node.to, insert: "" });
      }
    } else if (p) edits.push({ from: p.value.from, to: p.value.to, insert: lit(v) });
    else added[k] = v;
  }
  const extra = fieldsText(added);
  if (extra) {
    const last = existing.at(-1);
    if (last) edits.push({ from: last.node.to, to: last.node.to, insert: `, ${extra}` });
    else edits.push({ from: found.spec.from, to: found.spec.to, insert: `{ ${extra} }` });
  }
  return apply(code, edits);
}

/** Deletes param `id` (its whole line when it has one). */
export function removeParam(code: string, id: string): string | null {
  const obj = paramsObject(code);
  const p = obj && props(code, obj).find((e) => e.key === id);
  if (!p) return null;
  let from = p.node.from, to = p.node.to;
  const comma = code.slice(to).match(/^\s*,/);
  if (comma) to += comma[0].length;
  const lineStart = code.lastIndexOf("\n", from - 1) + 1;
  const lineEnd = code.indexOf("\n", to);
  if (/^\s*$/.test(code.slice(lineStart, from)) && /^\s*$/.test(code.slice(to, lineEnd < 0 ? undefined : lineEnd))) {
    from = lineStart;
    to = lineEnd < 0 ? code.length : lineEnd + 1;
  }
  return apply(code, [{ from, to, insert: "" }]);
}

/** Whether the code reads param `id` anywhere besides its declaration. */
export function usesParam(code: string, id: string) {
  const esc = id.replace(/[$]/g, "\\$");
  return new RegExp(`param\\(\\s*["'\`]${esc}["'\`]`).test(code);
}

/** A free camelCase id for a param named `name`. */
export function paramIdFor(name: string, taken: Iterable<string>) {
  const words = name.toLowerCase().normalize("NFKD").replace(/[^\w\s]/g, "").split(/[\s_]+/).filter(Boolean);
  let base = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("") || "param";
  if (/^\d/.test(base)) base = `p${base}`;
  const used = new Set(taken);
  let id = base, n = 2;
  while (used.has(id)) id = `${base}${n++}`;
  return id;
}

export const isValidParamId = (id: string) => /^[A-Za-z_$][\w$]*$/.test(id) && !id.startsWith("__");
