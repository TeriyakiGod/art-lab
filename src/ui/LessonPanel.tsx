import { useEffect, useRef, useState } from "react";
import { LESSONS } from "../../shared/lessons";
import { lessonFor, linkLesson } from "../lib/challenge";
import { LessonBody } from "./Learn";

/** The course inside the studio, so you can read a lesson while you code. */
export function LessonPanel(props: { sketchId: string; done: Set<string>; onComplete(id: string): void; onUseCode(code: string): void }) {
  const [id, setId] = useState(() => lessonFor(props.sketchId)?.lessonId ?? LESSONS[0].id);
  const scroller = useRef<HTMLDivElement>(null);
  const idx = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[idx];
  const next = LESSONS[idx + 1];

  useEffect(() => {
    linkLesson(props.sketchId, id);
    scroller.current?.scrollTo({ top: 0 });
  }, [id, props.sketchId]);

  if (!lesson) return null;
  return (
    <div className="lesson-panel">
      <div className="lesson-panel-head">
        <select aria-label="Lesson" value={id} onChange={(e) => setId(e.target.value)}>
          {LESSONS.map((l) => <option key={l.id} value={l.id}>{props.done.has(l.id) ? "✓ " : ""}{l.title}</option>)}
        </select>
        <a className="small" href={`#/learn/${lesson.id}`} title="Open the full lesson page">full page ↗</a>
      </div>
      <div className="lesson-panel-body lesson" ref={scroller}>
        <h2>{lesson.title}</h2>
        <LessonBody lesson={lesson} onUseCode={props.onUseCode} />
        <div className="lesson-foot">
          {props.done.has(lesson.id) ? <span className="muted">✓ Completed</span> : <button className="primary" onClick={() => props.onComplete(lesson.id)}>Mark as done</button>}
          {next && <button onClick={() => setId(next.id)}>Next: {next.title} →</button>}
        </div>
      </div>
    </div>
  );
}
