import { useEffect, useState } from "react";
import type { Sketch } from "../../shared/types";
import { TEMPLATES } from "../templates";
import { deleteSketch, listSketches, subscribe } from "../lib/store";
import { createSketch } from "../lib/create";
import { LESSONS } from "../../shared/lessons";
import { GENERATE_PLACEHOLDER, generateKey } from "../../shared/types";

const IDEAS = ["Concentric circles that wobble with noise", "A night sky of stars, mostly tiny, a few bright", "Hatched lines that follow a flow field"];

export function Home({ done }: { done: Set<string> }) {
  const [sketches, setSketches] = useState<Sketch[] | null>(null);
  useEffect(() => {
    const load = () => void listSketches().then(setSketches);
    load();
    return subscribe(load);
  }, []);
  const next = LESSONS.find((l) => !done.has(l.id));
  const [idea, setIdea] = useState("");
  const generate = async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    const title = prompt.length > 48 ? `${prompt.slice(0, 45).trimEnd()}…` : prompt;
    // Studio picks the description up and hands it to the assistant.
    const s = await createSketch({ title, code: GENERATE_PLACEHOLDER }, false);
    try { sessionStorage.setItem(generateKey(s.id), prompt); } catch { /* private mode: opens empty */ }
    location.hash = `#/sketch/${s.id}`;
  };

  return (
    <div className="home">
      {next && (
        <a className="card lesson-cta" href={`#/learn/${next.id}`}>
          <span className="small muted">{done.size ? "Continue learning" : "New here? Start with"}</span>
          <strong>{next.title}</strong>
          <span className="small">{next.summary}</span>
        </a>
      )}

      <h2>Describe an idea</h2>
      <form className="generate" onSubmit={(e) => { e.preventDefault(); void generate(idea); }}>
        <textarea
          value={idea}
          rows={2}
          placeholder="e.g. a grid of circles that shrink toward the edges"
          aria-label="Describe a sketch for the assistant to write"
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void generate(idea); } }}
        />
        <button className="primary" type="submit" disabled={!idea.trim() || !navigator.onLine}>Generate</button>
      </form>
      <div className="chips">
        {IDEAS.map((t) => <button key={t} className="chip" onClick={() => void generate(t)}>{t}</button>)}
      </div>

      <h2>Start from a template</h2>
      <div className="grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="card" onClick={() => void createSketch({ title: t.title, code: t.code, engine: t.engine })}>
            <strong>{t.title}{t.engine === "p5" && <span className="badge">p5.js</span>}</strong>
            <span className="small muted">{t.description}</span>
          </button>
        ))}
      </div>

      <h2>Your sketches</h2>
      {sketches?.length === 0 && <p className="muted">Nothing yet. Pick a template above.</p>}
      <ul className="sketch-list">
        {sketches?.map((s) => (
          <li key={s.id}>
            <a href={`#/sketch/${s.id}`}>
              <strong>{s.title}</strong>
              <span className="small muted">edited {new Date(s.updatedAt).toLocaleString()}</span>
            </a>
            <button className="link danger" onClick={() => confirm(`Delete “${s.title}” and its saved outputs?`) && void deleteSketch(s.id)}>
              delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
