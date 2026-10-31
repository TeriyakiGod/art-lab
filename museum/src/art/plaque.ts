import { CanvasTexture, SRGBColorSpace } from "three";
import { floorY, type WallSlot } from "../../../shared/museum/generate";
import type { Exhibit } from "../../../shared/museum/manifest";

/**
 * The label beside each work, physically on the wall to its right. It grows with the work (so it
 * stays readable when a big work fills the view), within the free wall the generator left beside it.
 */
export const PLAQUE = { aspect: 0.66, gap: 0.05 };

/** Plaque size and center in the work's own frame (x to the viewer's right, y up, origin at the work's center). */
export function plaqueLayout(slot: Pick<WallSlot, "w" | "h" | "y" | "level" | "space">) {
  const room = Math.max(0.24, slot.space - PLAQUE.gap - 0.06);
  const w = Math.min(room, 0.7, Math.max(0.26, 0.2 + 0.24 * Math.max(slot.w, slot.h)));
  const h = w * PLAQUE.aspect;
  const floor = floorY(slot.level);
  // Bottom-aligned with the work, but never below knee height or above the work's top.
  const bottom = Math.max(slot.y - slot.h / 2, floor + 0.95);
  const y = Math.min(bottom + h / 2, slot.y + slot.h / 2 - h / 2);
  return { x: slot.w / 2 + PLAQUE.gap + w / 2, y: Math.max(y, floor + 0.95 + h / 2) - slot.y, w, h };
}

/**
 * Where the camera goes to look closely: square to the wall, centered on the work and its plaque,
 * as far back as needed for both to fill the view (but no further than the room allows).
 */
export function focusFrame(slot: WallSlot, fovDeg: number, aspect: number) {
  const p = plaqueLayout(slot);
  const left = -slot.w / 2, right = p.x + p.w / 2;
  const bottom = Math.min(-slot.h / 2, p.y - p.h / 2), top = Math.max(slot.h / 2, p.y + p.h / 2);
  const margin = 1.12;
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const fit = Math.max(((top - bottom) / 2) * margin / tanV, ((right - left) / 2) * margin / (tanV * aspect));
  const distance = Math.max(0.45, Math.min(fit, slot.maxView));
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  // The viewer's right, facing the wall, is (nz, −nx).
  return {
    x: slot.x + slot.nz * cx + slot.nx * distance,
    z: slot.z - slot.nx * cx + slot.nz * distance,
    eyeY: slot.y + cy,
    yaw: Math.atan2(slot.nx, slot.nz),
    floor: floorY(slot.level),
  };
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "…");
  return lines;
}

/** Draws the plaque's text: title, wing and date, statement, and the facts (with the visitor's re-roll). */
export function plaqueTexture(e: Exhibit, rerolled?: string) {
  const W = 960, H = Math.round(W * PLAQUE.aspect);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#121216";
  g.fillRect(0, 0, W, H);
  // Big type: in a close-up of a large work the plaque is only a small part of the screen.
  const pad = 46;
  const font = (size: number, weight = 400, family = "Inter, system-ui, sans-serif") => `${weight} ${size}px ${family}`;
  let y = pad + 104;
  g.fillStyle = "#f4f3f8";
  g.font = font(118, 500);
  g.fillText(wrap(g, e.title, W - pad * 2, 1)[0] ?? "", pad, y);
  y += 78;
  g.fillStyle = "#a3a2b0";
  g.font = font(54, 500);
  g.fillText(`${e.wing.toUpperCase()} · ${new Date(e.createdAt).getFullYear()}`, pad, y);
  y += 84;
  if (e.statement) {
    g.fillStyle = "#dcdbe4";
    g.font = font(54);
    for (const line of wrap(g, e.statement, W - pad * 2, 2)) { g.fillText(line, pad, y); y += 66; }
  }
  g.fillStyle = "#a3a2b0";
  g.font = font(50, 500, "ui-monospace, Menlo, monospace");
  g.fillText(`seed ${rerolled ?? e.seed}`, pad, H - pad - (e.live ? 70 : 0));
  if (e.live) {
    g.fillStyle = "#6fd3e0";
    g.font = font(52, 700);
    g.fillText(rerolled ? "RE-ROLLED · R again, O original" : "LIVE · press R to re-roll", pad, H - pad);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
