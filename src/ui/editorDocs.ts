import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { hoverTooltip } from "@codemirror/view";
import { REF_ENTRIES, refEntry, type RefEntry } from "../../shared/reference";

// Plain text for tooltips: drop markdown links and backticks.
const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*]/g, "");

/** Members by their parent path: "lab" -> lab.canvas, lab.noise2D, … */
const members = new Map<string, RefEntry[]>();
for (const e of REF_ENTRIES) {
  const i = e.name.lastIndexOf(".");
  if (i < 0) continue;
  const parent = e.name.slice(0, i);
  members.set(parent, [...(members.get(parent) ?? []), e]);
}
// Intermediate objects, so "$genart." offers "params", "random" and "math".
for (const parent of [...members.keys()]) {
  const i = parent.lastIndexOf(".");
  if (i < 0) continue;
  const up = parent.slice(0, i), name = parent;
  const list = members.get(up) ?? [];
  if (!list.some((e) => e.name === name)) list.push({ name, sig: name, summary: `${name}.…` });
  members.set(up, list);
}

function complete(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(/(?:\$genart|lab|ctx)(?:\.\w+)*\.\w*$/);
  if (!m) return null;
  const dot = m.text.lastIndexOf(".");
  const list = members.get(m.text.slice(0, dot));
  if (!list) return null;
  return {
    from: m.from + dot + 1,
    options: list.map((e) => ({
      label: e.name.slice(dot + 1),
      type: /\(/.test(e.sig) ? "function" : e.sig === e.name ? "namespace" : "property",
      detail: e.returns ? `→ ${plain(e.returns)}` : undefined,
      info: [e.sig, plain(e.summary)].filter((x, i) => i === 0 ? x !== e.name : true).join("\n\n"),
    })),
    validFor: /^\w*$/,
  };
}

const hover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  let start = pos - line.from, end = start;
  const word = /[\w$.]/;
  while (start > 0 && word.test(text[start - 1])) start--;
  while (end < text.length && /[\w$]/.test(text[end])) end++;
  if (start === end) return null;
  const name = text.slice(start, end);
  // Dotted names first ("lab.noise2D"), then bare p5 names ("circle").
  const entry = refEntry(name) ?? (name.includes(".") ? undefined : REF_ENTRIES.find((e) => e.engine === "p5" && e.name === name));
  if (!entry) return null;
  return {
    pos: line.from + start,
    end: line.from + end,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-ref-tip";
      const sig = document.createElement("code");
      sig.textContent = entry.sig;
      const p = document.createElement("div");
      p.textContent = plain(entry.summary) + (entry.returns ? ` Returns ${plain(entry.returns)}.` : "");
      const a = document.createElement("a");
      a.href = `#/reference/${encodeURIComponent(entry.name)}`;
      a.textContent = "More in Reference ↗";
      a.target = "_blank";
      dom.append(sig, p, a);
      return { dom };
    },
  };
});

/** Autocomplete and hover docs for the lab's API, from shared/reference. */
export const editorDocs = [javascriptLanguage.data.of({ autocomplete: complete }), hover];
