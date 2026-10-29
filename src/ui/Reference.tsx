import { useEffect, useMemo, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { REFERENCE, refAnchor, searchReference, type RefEntry } from "../../shared/reference";

const inline: Components = {
  p: ({ children }) => <>{children}</>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
};
const md = (text: string, block = false) => <Markdown components={block ? { a: inline.a } : inline}>{text}</Markdown>;

/** The searchable API reference, shared by the Reference page and the studio panel. */
export function ReferenceBody({ focus }: { focus?: string }) {
  const [query, setQuery] = useState("");
  const hits = useMemo(() => new Set(searchReference(query).map((e) => e.name)), [query]);

  useEffect(() => {
    if (focus) document.getElementById(refAnchor(focus))?.scrollIntoView({ block: "start" });
  }, [focus]);

  return (
    <div className="reference">
      <input className="ref-search" type="search" placeholder="Search, e.g. noise, color, slider…" aria-label="Search the reference"
        value={query} onChange={(e) => setQuery(e.target.value)} />
      {!query && (
        <nav className="ref-toc small">
          {REFERENCE.map((s) => <a key={s.id} href={`#ref-sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`ref-sec-${s.id}`)?.scrollIntoView(); }}>{s.title}</a>)}
        </nav>
      )}
      {REFERENCE.map((s) => {
        const entries = s.entries.filter((e) => hits.has(e.name));
        if (!entries.length) return null;
        return (
          <section key={s.id} id={`ref-sec-${s.id}`}>
            <h2>{s.title}</h2>
            {!query && <p className="muted">{md(s.intro)}</p>}
            {entries.map((e) => <Entry key={e.name} e={e} />)}
          </section>
        );
      })}
      {hits.size === 0 && <p className="muted">Nothing matches “{query}”. Try a shorter word, or ask the assistant.</p>}
    </div>
  );
}

function Entry({ e }: { e: RefEntry }) {
  return (
    <div className="ref-entry" id={refAnchor(e.name)}>
      <div className="ref-sig">
        <code>{e.sig}</code>
        {e.engine && <span className="badge">{e.engine === "p5" ? "p5 only" : "canvas only"}</span>}
      </div>
      <p>{md(e.summary)}</p>
      {e.details && <div className="ref-details">{md(e.details, true)}</div>}
      {e.args && (
        <dl className="ref-args">
          {e.args.map(([k, v]) => (
            <div key={k}><dt><code>{k}</code></dt><dd>{md(v)}</dd></div>
          ))}
        </dl>
      )}
      {e.returns && <p className="small"><span className="muted">Returns</span> {md(e.returns)}</p>}
      {e.example && <pre><code>{e.example}</code></pre>}
    </div>
  );
}

export function ReferencePage({ focus }: { focus?: string }) {
  return (
    <article className="lesson">
      <h1>Reference</h1>
      <p className="muted">
        Every function and setting a sketch can use. In the editor, type <code>lab.</code> or <code>$genart.</code> for suggestions, and hover a name to see its docs.
      </p>
      <ReferenceBody key={focus} focus={focus} />
    </article>
  );
}
