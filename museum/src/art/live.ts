import { useSyncExternalStore } from "react";
import { SRGBColorSpace, Texture } from "three";
import { buildSrcdoc, loadEngine, type SandboxMessage } from "../../../src/runtime/sandbox";
import type { Engine } from "../../../shared/types";

/**
 * Live art: runs an exhibit's sketch in the lab's sandbox (an iframe with an opaque origin and no
 * network) and streams its canvas onto the wall as a texture. Also keeps each visitor's re-rolled
 * seeds. The scene decides which works should be live (`setWanted`); this file runs them.
 */

type Source = { code: string; engine: Engine; seed: string; values: Record<string, unknown>; width: number; height: number };
type Status = "loading" | "running" | "error";

/** Longest side of streamed frames, and frames per second for animated works. */
const FRAME_SIZE = 1024;
const FPS = 30;

/** A sketch that stops sending heartbeats this long after it started loading is torn down. */
const WATCHDOG_MS = 10_000;
/** A failed work is tried again after this long. */
const RETRY_MS = 15_000;

const sources = new Map<string, Promise<Source>>();
const failedAt = new Map<string, number>();
const textures = new Map<string, Texture>();
const statuses = new Map<string, Status>();
const rerolls = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/** Code and params of a live exhibit, from the museum Worker (only live works are served). */
function source(id: string): Promise<Source> {
  let p = sources.get(id);
  if (!p) {
    p = fetch(`/api/exhibits/${id}/sketch`).then(async (r) => {
      if (!r.ok) throw new Error(`sketch ${r.status}`);
      const s = (await r.json()) as Source;
      // Outputs are saved at 2× the sketch size.
      return { ...s, width: Math.max(100, Math.round(s.width / 2)), height: Math.max(100, Math.round(s.height / 2)) };
    });
    p.catch(() => sources.delete(id));
    sources.set(id, p);
  }
  return p;
}

/** The hidden iframes live here: invisible but on screen, since browsers pause hidden frames' animation. */
function host() {
  let el = document.getElementById("live-sketches");
  if (!el) {
    el = document.createElement("div");
    el.id = "live-sketches";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", left: "0", top: "0", width: "64px", height: "64px", opacity: "0", pointerEvents: "none", zIndex: "-1", overflow: "hidden" });
    document.body.appendChild(el);
  }
  return el;
}

class Runner {
  private iframe = document.createElement("iframe");
  private channel = Math.random().toString(36).slice(2);
  private lastAlive = performance.now();
  private watchdog: ReturnType<typeof setInterval>;
  private stopped = false;

  constructor(readonly id: string, readonly seed: string, animated: boolean) {
    this.iframe.setAttribute("sandbox", "allow-scripts");
    Object.assign(this.iframe.style, { width: "64px", height: "64px", border: "0" });
    window.addEventListener("message", this.onMessage);
    statuses.set(id, "loading");
    emit();
    void this.start(animated);
    // The clock starts once the sketch document is in place (fetching code and p5 can take a while).
    this.watchdog = setInterval(() => {
      if (this.iframe.isConnected && performance.now() - this.lastAlive > WATCHDOG_MS) this.fail();
    }, 1000);
  }

  private async start(animated: boolean) {
    try {
      const s = await source(this.id);
      await loadEngine(s.engine);
      if (this.stopped) return;
      const dpr = Math.min(2, FRAME_SIZE / Math.max(s.width, s.height));
      this.iframe.srcdoc = buildSrcdoc({ ...s, seed: this.seed, dpr, mode: "play", channel: this.channel });
      host().appendChild(this.iframe);
      this.lastAlive = performance.now();
      // Still works only need a few frames once drawn; animated ones stream continuously.
      this.fps = animated ? FPS : 4;
    } catch {
      this.fail();
    }
  }

  private fps = FPS;

  private onMessage = (e: MessageEvent) => {
    if (e.source !== this.iframe.contentWindow || e.data?.channel !== this.channel) return;
    const m = e.data as SandboxMessage;
    if (m.type === "lab:ready" || m.type === "lab:alive") this.lastAlive = performance.now();
    if (m.type === "lab:ready") this.iframe.contentWindow?.postMessage({ type: "lab:stream", channel: this.channel, fps: this.fps, maxSize: FRAME_SIZE }, "*");
    else if (m.type === "lab:error") this.fail();
    else if (m.type === "lab:frame") this.show(m.bitmap);
  };

  private show(bitmap: ImageBitmap) {
    if (this.stopped) return bitmap.close();
    const current = textures.get(this.id);
    const prev = current?.image as ImageBitmap | undefined;
    if (current && prev && prev.width === bitmap.width && prev.height === bitmap.height) {
      // The previous frame is already on the GPU; swap in the new one.
      prev.close();
      current.image = bitmap;
      current.needsUpdate = true;
      if (statuses.get(this.id) !== "running") {
        statuses.set(this.id, "running");
        emit();
      }
    } else {
      current?.dispose();
      const t = new Texture(bitmap);
      t.colorSpace = SRGBColorSpace;
      t.flipY = false; // the sandbox already flipped it
      t.needsUpdate = true;
      textures.set(this.id, t);
      if (statuses.get(this.id) !== "running") statuses.set(this.id, "running");
      emit();
    }
  }

  private fail() {
    statuses.set(this.id, "error");
    failedAt.set(this.id, performance.now());
    emit();
    this.stop(false);
  }

  /** `keepFrame`: leave the last frame on the wall (for re-rolled works). */
  stop(keepFrame: boolean) {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.watchdog);
    window.removeEventListener("message", this.onMessage);
    this.iframe.srcdoc = "";
    this.iframe.remove();
    if (statuses.get(this.id) !== "error") statuses.delete(this.id);
    if (!keepFrame) {
      textures.get(this.id)?.dispose();
      textures.delete(this.id);
    }
    emit();
  }
}

const runners = new Map<string, Runner>();

/** `seed` is the work's own seed; a visitor's re-roll takes precedence. */
export type Wanted = { id: string; animated: boolean; seed: string };

export const live = {
  /** Runs exactly these works live (in priority order), stopping the rest. */
  setWanted(wanted: Wanted[]) {
    const byId = new Map(wanted.map((w) => [w.id, w]));
    for (const [id, r] of runners) {
      const w = byId.get(id);
      if (!w || r.seed !== live.seedOf(id, w.seed)) {
        // Walking away from a re-rolled work leaves its last frame up.
        r.stop(!w && rerolls.has(id));
        runners.delete(id);
      }
    }
    for (const w of wanted) {
      if (runners.has(w.id)) continue;
      if (statuses.get(w.id) === "error" && performance.now() - (failedAt.get(w.id) ?? 0) < RETRY_MS) continue;
      runners.set(w.id, new Runner(w.id, live.seedOf(w.id, w.seed), w.animated));
    }
  },
  /** The seed a work is shown with: the visitor's re-roll, or `original`. */
  seedOf(id: string, original = ""): string {
    return rerolls.get(id) ?? original;
  },
  reroll(id: string, seed = Math.random().toString(36).slice(2, 10)) {
    rerolls.set(id, seed);
    statuses.delete(id);
    // Restart with the new seed right away; the scene keeps it wanted.
    runners.get(id)?.stop(true);
    runners.delete(id);
    emit();
    return seed;
  },
  original(id: string) {
    rerolls.delete(id);
    runners.get(id)?.stop(false);
    runners.delete(id);
    textures.get(id)?.dispose();
    textures.delete(id);
    statuses.delete(id);
    emit();
  },
  rerolled: (id: string) => rerolls.get(id),
  texture: (id: string) => textures.get(id),
  status: (id: string) => statuses.get(id),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

/** Re-renders when anything live changes; read values with `live.*` inside. */
export const useLive = () => useSyncExternalStore(live.subscribe, () => version);
