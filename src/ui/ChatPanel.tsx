import { useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart } from "ai";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, GENERATE_PLACEHOLDER, modelSees, type ChatBody, type Engine, type HintLevel, type Sketch } from "../../shared/types";
import { createSketch } from "../lib/create";
import { nextHint, setHintsUsed } from "../lib/challenge";
import { LESSONS } from "../../shared/lessons";
import { LOOK_TOOL } from "../../shared/chatImages";
import { DiffStats, DiffView, diffSummary } from "./DiffView";

interface Props {
  userId: string;
  sketch: Sketch;
  errors: string[];
  lessonId?: string;
  onApplyCode(code: string, engine?: Engine): void;
  /** A description from Home to generate this sketch from; sent once when the chat connects. */
  generatePrompt?: string;
  /** Set when this sketch is an attempt at a lesson challenge. */
  challenge?: { lessonId: string; hints: number } | null;
  onSetParams(values: Record<string, unknown>): void;
  /** A small JPEG data URL of the canvas as drawn right now. */
  capture(): Promise<string>;
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
  const [attach, setAttach] = useState(false);
  const sees = modelSees(model);
  const latest = useRef(props);
  latest.current = props;
  const modelRef = useRef(model);
  modelRef.current = model;
  // True from the Home "generate" message until its code is applied.
  const generating = useRef(false);
  // The hint rung the next request asks for (only for the hint button's own message).
  const hintAsk = useRef<HintLevel | undefined>(undefined);
  const [hintsUsed, setHintsUsedState] = useState(props.challenge?.hints ?? 0);
  const challengeLesson = props.challenge ? LESSONS.find((l) => l.id === props.challenge!.lessonId) : undefined;

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
        generate: generating.current || undefined,
        challenge: latest.current.challenge ? { lessonId: latest.current.challenge.lessonId, hint: hintAsk.current } : undefined,
      };
    },
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === "set_params") {
        const { values } = toolCall.input as { values: Record<string, unknown> };
        latest.current.onSetParams(values);
        addToolOutput({ toolCallId: toolCall.toolCallId, output: { applied: Object.keys(values) } });
      }
      if (toolCall.toolName === LOOK_TOOL) {
        try {
          addToolOutput({ toolCallId: toolCall.toolCallId, output: { image: await latest.current.capture() } });
        } catch (e) {
          addToolOutput({ toolCallId: toolCall.toolCallId, output: { error: `Couldn't capture the canvas: ${(e as Error).message}` } });
        }
      }
      if (toolCall.toolName === "propose_edit" && latest.current.sketch.code === GENERATE_PLACEHOLDER) {
        // Nothing to lose yet: a freshly generated sketch is applied without asking.
        const { code, engine } = toolCall.input as { code: string; engine?: Engine };
        latest.current.onApplyCode(code, engine);
        generating.current = false;
        addToolOutput({ toolCallId: toolCall.toolCallId, output: { accepted: true } });
      }
      if (toolCall.toolName === "create_sketch") {
        const { title, code, engine } = toolCall.input as { title: string; code: string; engine?: Engine };
        const s = await createSketch({ title, code, engine }, false);
        addToolOutput({ toolCallId: toolCall.toolCallId, output: { created: s.id, title: s.title } });
      }
      // Other propose_edit calls wait for the user's Accept / Reject in the message list.
    },
  });

  // Home's "generate" hands over a description: send it once the socket is open.
  const sentPrompt = useRef(false);
  useEffect(() => {
    const prompt = props.generatePrompt;
    if (!prompt) return;
    const go = () => {
      if (sentPrompt.current) return;
      sentPrompt.current = true;
      generating.current = true;
      sendMessage({ role: "user", parts: [{ type: "text", text: prompt }] });
    };
    if (agent.readyState === WebSocket.OPEN) go();
    else {
      agent.addEventListener("open", go, { once: true });
      return () => agent.removeEventListener("open", go);
    }
    // Only for the prompt this panel was opened with.
  }, [props.generatePrompt]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (!busy) hintAsk.current = undefined;
  }, [busy]);
  const askHint = () => {
    if (busy || !props.challenge) return;
    const level = nextHint(hintsUsed);
    hintAsk.current = level;
    setHintsUsedState(level);
    setHintsUsed(sketch.id, props.challenge.lessonId, level);
    const ask = level === 1 ? "I'm stuck. Can you give me a small nudge?" : level === 2 ? "I'm still stuck. Can I have a more concrete hint?" : "Please show me a solution and explain it.";
    sendMessage({ role: "user", parts: [{ type: "text", text: ask }] });
  };
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
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    const parts: ({ type: "text"; text: string } | { type: "file"; mediaType: string; url: string })[] = [{ type: "text", text }];
    if (attach && sees) {
      setAttach(false); // one snapshot per message
      try {
        parts.push({ type: "file", mediaType: "image/jpeg", url: await props.capture() });
      } catch { /* send without the snapshot */ }
    }
    sendMessage({ role: "user", parts });
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

      {challengeLesson?.challenge && (
        <details className="challenge-banner">
          <summary>
            <span>Challenge · {challengeLesson.title}</span>
            <button className="chip" disabled={busy} onClick={(e) => { e.preventDefault(); askHint(); }}>
              {hintsUsed === 0 ? "Stuck? Get a nudge" : hintsUsed === 1 ? "Another hint" : "Show a solution"}
            </button>
          </summary>
          <div className="small md"><Markdown remarkPlugins={[remarkGfm]}>{challengeLesson.challenge}</Markdown></div>
        </details>
      )}
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
              if (part.type === "file" && part.mediaType.startsWith("image/")) return <img key={i} className="chat-image" src={part.url} alt="Canvas snapshot" />;
              if (part.type === "reasoning") return part.text.trim() ? <Reasoning key={i} text={part.text} live={part.state === "streaming"} /> : null;
              if (!isToolUIPart(part)) return null;
              const name = getToolName(part);
              const pending = part.state === "input-streaming" || part.state === "input-available";
              if (name === LOOK_TOOL) {
                const image = "output" in part ? (part.output as { image?: string } | undefined)?.image : undefined;
                return (
                  <div key={i} className={`tool-note${pending ? " live" : ""}`}>
                    {pending ? "👀 Looking at the canvas…" : "👀 Looked at the canvas"}
                    {image && <img className="chat-image" src={image} alt="What the assistant saw" />}
                  </div>
                );
              }
              if (name === "create_sketch") {
                const out = "output" in part ? (part.output as { created?: string; title?: string } | undefined) : undefined;
                return out?.created ? (
                  <a key={i} className="card new-sketch" href={`#/sketch/${out.created}`}>
                    <span className="small muted">New sketch</span>
                    <strong>{out.title} →</strong>
                  </a>
                ) : <div key={i} className="tool-note live">✨ Creating a new sketch…</div>;
              }
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
                      if (accepted && input?.code) props.onApplyCode(input.code, (input as { engine?: Engine }).engine);
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
        <button
          type="button"
          className={`icon attach ${attach && sees ? "on" : ""}`}
          aria-pressed={attach && sees}
          disabled={!sees}
          title={sees ? "Attach a snapshot of the canvas to your message" : "This model can't see images. Pick Balanced to share the canvas."}
          onClick={() => setAttach(!attach)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
          </svg>
        </button>
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
  // Once decided, the diff against today's code means nothing, so only the outcome is shown.
  if (decided) {
    return (
      <div className="proposal">
        <div className="proposal-head static">
          <span>✏️ {summary ?? "Proposed change"}</span>
          <span className="small muted">{output?.accepted ? "Applied" : "Rejected"}</span>
        </div>
      </div>
    );
  }
  const { lines, added, removed } = diffSummary(current, code ?? current);
  return (
    <div className="proposal">
      <button className="proposal-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>✏️ {summary ?? "Proposed change"}</span>
        <DiffStats added={added} removed={removed} />
      </button>
      {open && <DiffView lines={lines} />}
      <div className="row pad-s">
        <button className="primary" onClick={() => props.onDecide(true)}>Accept</button>
        <button onClick={() => props.onDecide(false)}>Reject</button>
      </div>
    </div>
  );
}
