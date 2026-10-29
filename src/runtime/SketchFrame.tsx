import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { buildSrcdoc, engineReady, loadEngine, type ParamSpec, type RunConfig, type SandboxMessage } from "./sandbox";
import type { Engine } from "../../shared/types";

export interface SketchError {
  message: string;
  line?: number;
}

export interface SketchFrameHandle {
  /** The current canvas as PNG (or JPEG), optionally downscaled so its longest side is maxSize. */
  capture(maxSize?: number, format?: "image/png" | "image/jpeg"): Promise<Blob>;
}

interface Props {
  code: string;
  engine?: Engine;
  seed: string;
  values: Record<string, unknown>;
  width: number;
  height: number;
  dpr?: number;
  className?: string;
  onParams?(params: Record<string, ParamSpec>): void;
  onError?(err: SketchError): void;
  onLog?(level: string, text: string): void;
  onRun?(): void;
}

const newChannel = () => Math.random().toString(36).slice(2);

/** Listen for messages from one sandbox iframe (matched by window and channel). */
function listen(frame: () => HTMLIFrameElement | null, channel: string, fn: (m: SandboxMessage) => void) {
  const handler = (e: MessageEvent) => {
    if (e.source !== frame()?.contentWindow || e.data?.channel !== channel) return;
    fn(e.data as SandboxMessage);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export const SketchFrame = forwardRef<SketchFrameHandle, Props>(function SketchFrame(props, ref) {
  const { code, engine, seed, values, width, height, dpr = 1, className } = props;
  const iframe = useRef<HTMLIFrameElement>(null);
  const cbs = useRef(props);
  cbs.current = props;

  // p5 sketches wait for the p5 source to load (once).
  const [, loaded] = useState(0);
  const ready = engineReady(engine);
  useEffect(() => {
    if (!ready) void loadEngine(engine).then(() => loaded((n) => n + 1));
  }, [engine, ready]);

  const valuesKey = JSON.stringify(values);
  const run = useMemo(() => {
    if (!ready) return null;
    const channel = newChannel();
    const cfg: RunConfig = { code, engine, seed, values: JSON.parse(valuesKey), width, height, dpr, mode: "edit", channel };
    return { channel, srcdoc: buildSrcdoc(cfg) };
  }, [ready, code, engine, seed, valuesKey, width, height, dpr]);

  useEffect(() => {
    if (!run) return;
    cbs.current.onRun?.();
    let lastAlive = 0;
    let dead = false;
    const stop = listen(() => iframe.current, run.channel, (m) => {
      if (m.type === "lab:ready" || m.type === "lab:alive") lastAlive = performance.now();
      else if (m.type === "lab:params") {
        const specs = Object.fromEntries(
          Object.entries(m.params).map(([id, spec]) => [id, id in m.values ? { ...spec, value: m.values[id] } : spec]),
        );
        cbs.current.onParams?.(specs);
      }
      else if (m.type === "lab:error") cbs.current.onError?.({ message: m.message, line: m.line });
      else if (m.type === "lab:log") cbs.current.onLog?.(m.level, m.text);
    });
    // Watchdog: if the sketch stops sending heartbeats, tear the frame down.
    const watchdog = setInterval(() => {
      if (!dead && lastAlive && performance.now() - lastAlive > 6000) {
        dead = true;
        if (iframe.current) iframe.current.srcdoc = "";
        cbs.current.onError?.({ message: "The sketch stopped responding and was stopped. Check for an endless loop." });
      }
    }, 1000);
    return () => {
      stop();
      clearInterval(watchdog);
    };
  }, [run]);

  useImperativeHandle(ref, () => ({
    capture: (maxSize?: number, format?: "image/png" | "image/jpeg") =>
      run ? requestCapture(iframe.current, run.channel, maxSize, format) : Promise.reject(new Error("sketch not running")),
  }), [run]);

  return (
    <iframe
      ref={iframe}
      className={className}
      title="Sketch"
      sandbox="allow-scripts"
      srcDoc={run?.srcdoc ?? ""}
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  );
});

function requestCapture(frame: HTMLIFrameElement | null, channel: string, maxSize?: number, format?: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!frame?.contentWindow) return reject(new Error("sketch not running"));
    const timeout = setTimeout(() => (stop(), reject(new Error("capture timed out"))), 10_000);
    const stop = listen(() => frame, channel, (m) => {
      if (m.type !== "lab:capture") return;
      clearTimeout(timeout);
      stop();
      if (m.blob) resolve(m.blob);
      else reject(new Error(m.error ?? "capture failed"));
    });
    frame.contentWindow.postMessage({ type: "lab:capture-request", channel, maxSize, format, quality: format === "image/jpeg" ? 0.8 : undefined }, "*");
  });
}

/**
 * Renders a sketch in a hidden iframe at `scale`× resolution and returns the PNG.
 * Captures once the sketch's top-level code has finished; sketches that never
 * finish (e.g. awaiting forever) are captured a few seconds after their params.
 */
export async function renderToPNG(opts: Omit<RunConfig, "channel" | "mode" | "dpr"> & { scale: number }): Promise<Blob> {
  await loadEngine(opts.engine);
  const channel = newChannel();
  const frame = document.createElement("iframe");
  frame.sandbox.add("allow-scripts");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:400px;height:400px;visibility:hidden";
  frame.srcdoc = buildSrcdoc({ ...opts, dpr: opts.scale, mode: "preview", channel });
  document.body.appendChild(frame);
  const cleanup = () => frame.remove();
  return new Promise<Blob>((resolve, reject) => {
    const fail = setTimeout(() => (stop(), reject(new Error("render timed out"))), 60_000);
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const stop = listen(() => frame, channel, (m) => {
      if (m.type === "lab:error") {
        clearTimeout(fail);
        clearTimeout(fallback);
        stop();
        reject(new Error(m.message));
      } else if (m.type === "lab:done") {
        clearTimeout(fail);
        clearTimeout(fallback);
        stop();
        requestCapture(frame, channel).then(resolve, reject);
      } else if (m.type === "lab:params") {
        clearTimeout(fallback);
        fallback = setTimeout(() => (clearTimeout(fail), stop(), requestCapture(frame, channel).then(resolve, reject)), 5000);
      }
    });
  }).finally(cleanup);
}
