import { useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart } from "ai";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, type ChatBody, type Sketch } from "../../shared/types";
import { DiffStats, DiffView, diffSummary } from "./DiffView";

interface Props {
  userId: string;
  sketch: Sketch;
  errors: string[];
  lessonId?: string;
  onApplyCode(code: string): void;
  onSetParams(values: Record<string, unknown>): void;
}

const MODEL_KEY = "art-lab:chat-model";
const SUGGESTIONS = [
  "Explain this sketch line by line",
  "Add a parameter for the background color",
  "Make it feel more organic",
  "Why does changing the seed change the picture?",
];

export function ChatPanel(props: Props) {
  const { userId, sketch } = props;
  const [model, setModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(MODEL_KEY);
      // A model dropped from the list falls back to the default.
      return CHAT_MODELS.some((m) => m.id === saved) ? saved! : DEFAULT_CHAT_MODEL;
    } catch { return DEFAULT_CHAT_MODEL; }
  });
  const [input, setInput] = useState("");
  const latest = useRef(props);
  latest.current = props;
  const modelRef = useRef(model);
  modelRef.current = model;

  // One conversation per sketch; the server only lets a user reach agents prefixed with their id.
  const agent = useAgent({ agent: "ChatAgent", name: `${userId}--${sketch.id}` });
  const { messages, sendMessage, status, stop, clearHistory, addToolOutput } = useAgentChat({
    agent,
    body: (): ChatBody => {
      const { sketch, errors, lessonId } = latest.current;
      return {
        model: modelRef.current,
        sketch: { title: sketch.title, code: sketch.code, engine: sketch.engine ?? "canvas", values: sketch.values, seed: sketch.seed },
        errors,
        lessonId,
      };
    },
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === "set_params") {
        const { values } = toolCall.input as { values: Record<string, unknown> };
        latest.current.onSetParams(values);
        addToolOutput({ toolCallId: toolCall.toolCallId, output: { applied: Object.keys(values) } });
      }
      // propose_edit waits for the user's Accept / Reject in the message list.
    },
  });

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";
  // Keep an indicator up until something on screen shows progress; otherwise
  // the gaps (before the first token, between steps) look like a stall.
  const last = messages.at(-1);
  const tail = last?.role === "assistant" ? last.parts.findLast((p) => p.type !== "step-start") : undefined;
  const tailLive =
    !!tail &&
    ((tail.type === "text" && !!tail.text.trim()) ||
      (tail.type === "reasoning" && tail.state === "streaming" && !!tail.text.trim()) ||
      (isToolUIPart(tail) && (tail.state === "input-streaming" || tail.state === "input-available")));
  const working = busy && !tailLive;
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    setInput("");
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <select
          aria-label="Model"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            try { localStorage.setItem(MODEL_KEY, e.target.value); } catch { /* private mode */ }
          }}
        >
          {CHAT_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button className="link" onClick={() => clearHistory()} disabled={!messages.length}>Clear</button>
      </div>

      <div className="chat-log" ref={scroller}>
        {!messages.length && (
          <div className="chat-empty">
            <p>Ask about your sketch, request changes, or describe something new to generate.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.parts.map((part, i) => {
              if (part.type === "text") return <div key={i} className="md"><Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown></div>;
              if (part.type === "reasoning") return part.text.trim() ? <Reasoning key={i} text={part.text} live={part.state === "streaming"} /> : null;
              if (!isToolUIPart(part)) return null;
              const name = getToolName(part);
              const pending = part.state === "input-streaming" || part.state === "input-available";
              if (name === "propose_edit") {
                const input = part.input as { code?: string; summary?: string } | undefined;
                return (
                  <ProposedEdit
                    key={i}
                    state={part.state}
                    summary={input?.summary}
                    code={input?.code}
                    current={sketch.code}
                    output={"output" in part ? (part.output as { accepted?: boolean }) : undefined}
                    onDecide={(accepted) => {
                      if (accepted && input?.code) props.onApplyCode(input.code);
                      addToolOutput({ toolCallId: part.toolCallId, output: { accepted } });
                    }}
                  />
                );
              }
              return (
                <div key={i} className={`tool-note${pending ? " live" : ""}`}>
                  {name === "search_lessons"
                    ? pending ? "📖 Looking through the lessons…" : "📖 Looked through the lessons"
                    : name === "set_params"
                      ? pending ? "🎛 Adjusting parameters…" : "🎛 Adjusted parameters"
                      : `⚙ ${name}`}
                </div>
              );
            })}
          </div>
        ))}
        {working && <div className="msg assistant muted live">Thinking…</div>}
        {status === "error" && <div className="msg assistant error">Something went wrong. Try again, or pick another model.</div>}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          rows={2}
          placeholder="Ask or describe a change…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        {busy ? <button type="button" onClick={() => stop()}>Stop</button> : <button type="submit" disabled={!input.trim()}>Send</button>}
      </form>
    </div>
  );
}

/** The model's reasoning: collapsed by default, with a pulsing label while it streams. */
function Reasoning({ text, live }: { text: string; live: boolean }) {
  return (
    <details className="reasoning">
      <summary className={live ? "live" : undefined}>{live ? "Thinking…" : "Thought it through"}</summary>
      <div className="reasoning-text">{text}</div>
    </details>
  );
}

function ProposedEdit(props: {
  state: string;
  summary?: string;
  code?: string;
  current: string;
  output?: { accepted?: boolean };
  onDecide(accepted: boolean): void;
}) {
  const { state, summary, code, current, output } = props;
  const [open, setOpen] = useState(true);
  if (state === "input-streaming") return <div className="tool-note live">✏️ Writing a change…</div>;
  const decided = state === "output-available";
  const { lines, added, removed } = diffSummary(current, code ?? current);
  return (
    <div className="proposal">
      <button className="proposal-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>✏️ {summary ?? "Proposed change"}</span>
        <DiffStats added={added} removed={removed} />
      </button>
      {open && <DiffView lines={lines} />}
      {decided ? (
        <div className="small muted pad-s">{output?.accepted ? "Applied" : "Rejected"}</div>
      ) : (
        <div className="row pad-s">
          <button className="primary" onClick={() => props.onDecide(true)}>Accept</button>
          <button onClick={() => props.onDecide(false)}>Reject</button>
        </div>
      )}
    </div>
  );
}
