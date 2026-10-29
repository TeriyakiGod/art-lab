import { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { LESSONS } from "../../shared/lessons";
import { SketchFrame } from "../runtime/SketchFrame";
import { randomSeed } from "../lib/store";
import { createSketch } from "../lib/create";
import { Editor } from "./Editor";

export function LessonList({ done }: { done: Set<string> }) {
  return (
    <div className="learn">
      <h1>Learn</h1>
      <p className="muted">A short course in algorithmic art. Every example is live: edit it, change the seed, open it in the studio.</p>
      <ol className="lesson-list">
        {LESSONS.map((l) => (
          <li key={l.id}>
            <a href={`#/learn/${l.id}`}>
              <span className={`check ${done.has(l.id) ? "on" : ""}`} aria-label={done.has(l.id) ? "completed" : "not completed"}>✓</span>
              <span>
                <strong>{l.title}</strong>
                <span className="small muted block">{l.summary}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
      <h2>Further reading</h2>
      <ul className="links">
        <li><a href="https://natureofcode.com" target="_blank" rel="noreferrer">The Nature of Code</a>: free book on simulating nature with code</li>
        <li><a href="https://thebookofshaders.com" target="_blank" rel="noreferrer">The Book of Shaders</a>: a gentle introduction to fragment shaders</li>
        <li><a href="https://www.tylerxhobbs.com/essays" target="_blank" rel="noreferrer">Tyler Hobbs' essays</a>: flow fields, color, randomness in art</li>
        <li><a href="https://thecodingtrain.com" target="_blank" rel="noreferrer">The Coding Train</a>: video coding challenges</li>
        <li><a href="https://inconvergent.net/generative/" target="_blank" rel="noreferrer">Inconvergent</a>: writing on generative algorithms</li>
      </ul>
    </div>
  );
}

export function LessonPage({ id, done, onComplete }: { id: string; done: Set<string>; onComplete(id: string): void }) {
  const idx = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[idx];
  if (!lesson) return <div className="pad">Lesson not found. <a href="#/learn">All lessons</a></div>;
  const next = LESSONS[idx + 1];

  const components: Components = {
    pre({ node, children }) {
      const code = node?.children[0];
      const cls = code && code.type === "element" ? (code.properties.className as string[] | undefined) : undefined;
      if (code?.type === "element" && cls?.includes("language-sketch")) {
        const text = code.children.map((c) => (c.type === "text" ? c.value : "")).join("");
        return <LiveExample code={text.trimEnd() + "\n"} title={lesson.title} />;
      }
      return <pre>{children}</pre>;
    },
    a({ href, children }) {
      const external = href && /^https?:/.test(href);
      return <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>{children}</a>;
    },
  };

  return (
    <article className="lesson">
      <a href="#/learn" className="small">← All lessons</a>
      <h1>{lesson.title}</h1>
      <Markdown components={components} remarkPlugins={[remarkGfm]}>{lesson.body}</Markdown>
      <div className="lesson-foot">
        {done.has(lesson.id) ? <span className="muted">✓ Completed</span> : <button className="primary" onClick={() => onComplete(lesson.id)}>Mark as done</button>}
        {next && <a className="button" href={`#/learn/${next.id}`}>Next: {next.title} →</a>}
      </div>
    </article>
  );
}

function LiveExample({ code: initial, title }: { code: string; title: string }) {
  const [code, setCode] = useState(initial);
  const [running, setRunning] = useState(initial);
  const [seed, setSeed] = useState("lesson");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  return (
    <div className="example">
      <div className="example-stage">
        <SketchFrame code={running} seed={seed} values={{}} width={600} height={600} className="example-frame"
          onRun={() => setError(null)} onError={(e) => setError(e.line ? `Line ${e.line}: ${e.message}` : e.message)} />
      </div>
      {error && <div className="log error small">⛔ {error}</div>}
      <div className="row wrap">
        <button onClick={() => setSeed(randomSeed())}>New seed</button>
        <button onClick={() => setEditing(!editing)}>{editing ? "Hide code" : "Edit code"}</button>
        {code !== running && <button className="primary" onClick={() => setRunning(code)}>Run ▶</button>}
        {code !== initial && <button className="link" onClick={() => { setCode(initial); setRunning(initial); }}>reset</button>}
        <button className="link" onClick={() => void createSketch({ title: `${title} example`, code })}>Open in studio ↗</button>
      </div>
      {editing && <div className="example-editor"><Editor value={code} onChange={setCode} /></div>}
    </div>
  );
}
