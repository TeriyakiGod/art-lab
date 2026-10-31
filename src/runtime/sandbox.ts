import genartSrc from "@genart-api/core/genart.min.js?raw";
import runtimeSrc from "./lab-runtime.js?raw";
import type { Engine } from "../../shared/types";
import { loopProtect } from "./loopProtect";

export interface RunConfig {
  code: string;
  /** Plain Canvas 2D (default) or p5.js in global mode. */
  engine?: Engine;
  seed: string;
  values: Record<string, unknown>;
  width: number;
  height: number;
  dpr: number;
  mode: "play" | "edit" | "preview";
  channel: string;
  /** Render only this region (device pixels) of the full image, for tiled export. */
  tile?: { x: number; y: number; w: number; h: number };
}

// Appended after the sketch's top-level code (same module scope).
// Canvas: drawing is finished once the code has run.
const DONE_TAIL = ";window.__labDone();";
// p5: hand the module's setup/draw/event functions (not globals in a module) to the runtime, which starts p5.
const P5_EVENTS = ["setup", "draw", "mousePressed", "mouseReleased", "mouseMoved", "mouseDragged", "mouseClicked", "doubleClicked",
  "mouseWheel", "keyPressed", "keyReleased", "keyTyped", "touchStarted", "touchMoved", "touchEnded", "windowResized"];
const P5_TAIL = `;window.__labP5({ ${P5_EVENTS.map((n) => `${n}: typeof ${n} === "function" ? ${n} : undefined`).join(", ")} });`;

// p5.js (~1 MB) is only fetched once a p5 sketch runs, then kept.
let p5Src: string | undefined;
export const engineReady = (engine?: Engine) => engine !== "p5" || p5Src !== undefined;
export async function loadEngine(engine?: Engine) {
  // p5's package exports don't include its prebuilt lib/, hence the relative path.
  if (engine === "p5" && p5Src === undefined) p5Src = (await import("../../node_modules/p5/lib/p5.min.js?raw")).default;
}

/** Escapes text so it can't close the surrounding <script> element. */
const scriptSafe = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/**
 * Builds the iframe document for a sketch. The iframe is created with
 * sandbox="allow-scripts" (no allow-same-origin), so it gets an opaque origin
 * and cannot read the app's cookies, storage or API. The CSP blocks all
 * network access.
 */
export function buildSrcdoc(cfg: RunConfig): string {
  if (!engineReady(cfg.engine)) throw new Error("call loadEngine() first");
  const { code, ...rest } = cfg;
  const head = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:">
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}body{display:grid;place-items:center}
main{display:contents}canvas,svg{display:block;max-width:100%;max-height:100%;width:auto!important;height:auto!important;object-fit:contain}</style>
<script>${scriptSafe(genartSrc)}</script>
<script>window.__LAB=${scriptSafe(JSON.stringify({ ...rest, lineOffset: 0 }))};</script>
<script>${scriptSafe(runtimeSrc)}</script>
${cfg.engine === "p5" ? `<script>${scriptSafe(p5Src!)}</script>` : ""}
</head><body>
<script type="module">
`;
  const lineOffset = head.split("\n").length - 1;
  return head.replace('"lineOffset":0', `"lineOffset":${lineOffset}`) + scriptSafe(loopProtect(code)) + "\n" + (cfg.engine === "p5" ? P5_TAIL : DONE_TAIL) + "\n</script></body></html>";
}

export type SandboxMessage =
  | { type: "lab:ready" | "lab:alive"; channel: string }
  | { type: "lab:params"; channel: string; params: Record<string, ParamSpec>; values: Record<string, unknown> }
  | { type: "lab:error"; channel: string; message: string; line?: number }
  | { type: "lab:log"; channel: string; level: string; text: string }
  | { type: "lab:capture"; channel: string; blob?: Blob; width?: number; height?: number; error?: string }
  | { type: "lab:traits"; channel: string; traits: Record<string, unknown> }
  | { type: "lab:done"; channel: string }
  /** A streamed frame (see `lab:stream` in lab-runtime.js). The receiver must close() it. */
  | { type: "lab:frame"; channel: string; bitmap: ImageBitmap };

export interface ParamSpec {
  type: string;
  name: string;
  desc?: string;
  doc?: string;
  group?: string;
  order?: number;
  value?: unknown;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: (string | [string, string])[];
  minLength?: number;
  maxLength?: number;
  multiline?: boolean;
}
