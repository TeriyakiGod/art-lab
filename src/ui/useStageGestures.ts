import { useRef, useState } from "react";

interface Handlers {
  onSwipeLeft(): void;
  onSwipeRight(): void;
  onLongPress(): void;
}

const LONG_PRESS_MS = 600;
const MOVE_SLOP = 10; // px a finger may drift and still count as "holding still"
const MAX_ZOOM = 5;

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Touch gestures for the canvas, used on a transparent layer over the sketch
 * iframe (touches would otherwise go into the iframe): swipe for the next or
 * previous seed, pinch to zoom, drag to pan while zoomed, double-tap to reset,
 * long-press to save.
 */
export function useStageGestures(h: Handlers) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Pt>());
  const g = useRef<{
    start?: Pt; moved: boolean; longPress?: ReturnType<typeof setTimeout>; fired: boolean;
    pinch?: { d: number; m: Pt; view: typeof view }; pan?: { p: Pt; view: typeof view }; lastTap: number;
  }>({ moved: false, fired: false, lastTap: 0 });

  const cancelLongPress = () => clearTimeout(g.current.longPress);
  const reset = () => setView({ scale: 1, x: 0, y: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    const s = g.current;
    if (pointers.current.size === 1) {
      Object.assign(s, { start: p, moved: false, fired: false, pinch: undefined, pan: view.scale > 1 ? { p, view } : undefined });
      s.longPress = setTimeout(() => {
        if (!s.moved && pointers.current.size === 1) {
          s.fired = true;
          navigator.vibrate?.(15);
          h.onLongPress();
        }
      }, LONG_PRESS_MS);
    } else if (pointers.current.size === 2) {
      cancelLongPress();
      const [a, b] = [...pointers.current.values()];
      Object.assign(s, { moved: true, pan: undefined, pinch: { d: dist(a, b), m: mid(a, b), view } });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    const s = g.current;
    if (s.start && dist(p, s.start) > MOVE_SLOP) {
      s.moved = true;
      cancelLongPress();
    }
    if (s.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const m = mid(a, b);
      const scale = Math.min(MAX_ZOOM, Math.max(1, s.pinch.view.scale * (dist(a, b) / s.pinch.d)));
      setView(scale === 1 ? { scale: 1, x: 0, y: 0 } : { scale, x: s.pinch.view.x + m.x - s.pinch.m.x, y: s.pinch.view.y + m.y - s.pinch.m.y });
    } else if (s.pan) {
      setView({ ...s.pan.view, x: s.pan.view.x + p.x - s.pan.p.x, y: s.pan.view.y + p.y - s.pan.p.y });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = g.current;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    cancelLongPress();
    if (pointers.current.size === 1) {
      // One finger lifted from a pinch: keep panning with the other.
      const [p] = [...pointers.current.values()];
      Object.assign(s, { pinch: undefined, pan: view.scale > 1 ? { p, view } : undefined });
      return;
    }
    if (!wasSingle || !s.start || s.fired || e.type === "pointercancel") return;
    const dx = e.clientX - s.start.x, dy = e.clientY - s.start.y;
    if (!s.moved) {
      const now = performance.now();
      if (now - s.lastTap < 300) reset();
      s.lastTap = now;
    } else if (view.scale === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) h.onSwipeLeft();
      else h.onSwipeRight();
    }
  };

  return {
    view,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` },
  };
}
