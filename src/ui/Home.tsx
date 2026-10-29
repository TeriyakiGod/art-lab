import { useEffect, useState } from "react";
import type { Sketch } from "../../shared/types";
import { TEMPLATES } from "../templates";
import { deleteSketch, listSketches, subscribe } from "../lib/store";
import { createSketch } from "../lib/create";
import { LESSONS } from "../../shared/lessons";

export function Home({ done }: { done: Set<string> }) {
  const [sketches, setSketches] = useState<Sketch[] | null>(null);
  useEffect(() => {
    const load = () => void listSketches().then(setSketches);
    load();
    return subscribe(load);
  }, []);
  const next = LESSONS.find((l) => !done.has(l.id));

  return (
    <div className="home">
      {next && (
        <a className="card lesson-cta" href={`#/learn/${next.id}`}>
          <span className="small muted">{done.size ? "Continue learning" : "New here? Start with"}</span>
          <strong>{next.title}</strong>
          <span className="small">{next.summary}</span>
        </a>
      )}

      <h2>Start from a template</h2>
      <div className="grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="card" onClick={() => void createSketch({ title: t.title, code: t.code })}>
            <strong>{t.title}</strong>
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
