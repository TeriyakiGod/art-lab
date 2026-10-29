import genartSrc from "@genart-api/core/genart.min.js?raw";
import runtimeSrc from "./lab-runtime.js?raw";
import { loopProtect } from "./loopProtect";

export interface RunConfig {
  code: string;
  seed: string;
  values: Record<string, unknown>;
  width: number;
  height: number;
  dpr: number;
  mode: "play" | "edit" | "preview";
  channel: string;
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
  const { code, ...rest } = cfg;
  const head = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:">
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}body{display:grid;place-items:center}
canvas,svg{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}</style>
<script>${scriptSafe(genartSrc)}</script>
<script>window.__LAB=${scriptSafe(JSON.stringify({ ...rest, lineOffset: 0 }))};</script>
<script>${scriptSafe(runtimeSrc)}</script>
</head><body>
<script type="module">
`;
  const lineOffset = head.split("\n").length - 1;
  return head.replace('"lineOffset":0', `"lineOffset":${lineOffset}`) + scriptSafe(loopProtect(code)) + "\n</script></body></html>";
}

export type SandboxMessage =
  | { type: "lab:ready" | "lab:alive"; channel: string }
  | { type: "lab:params"; channel: string; params: Record<string, ParamSpec>; values: Record<string, unknown> }
  | { type: "lab:error"; channel: string; message: string; line?: number }
  | { type: "lab:log"; channel: string; level: string; text: string }
  | { type: "lab:capture"; channel: string; blob?: Blob; width?: number; height?: number; error?: string }
  | { type: "lab:traits"; channel: string; traits: Record<string, unknown> };

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
