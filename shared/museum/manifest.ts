import type { Engine } from "../types";

/**
 * What the public museum knows about the collection. The museum generates its whole building from
 * this, so everything that affects the layout lives here and nothing else does.
 * See docs/museum-plan.md.
 */

/** Bump when the generator changes in a way that moves rooms: a deliberate "rehang". */
export const GENERATOR_VERSION = 1;

/** '3d' arrives with the lab's 3D mode (plan §9); a new medium is a new union case. */
export type Medium = "2d";

/** Physical size in meters. 3D works will add depth. */
export type Size2D = { w: number; h: number };

export type ExhibitBase = {
  id: string;
  title: string;
  statement: string;
  wing: string;
  /** Order across the whole museum (one sequence for all wings); only ever appended. */
  position: number;
  /** A candidate for an atrium. */
  hero: boolean;
  /** The museum may run the sketch live (and offer re-roll). If false, its code never leaves the server. */
  live: boolean;
  engine: Engine;
  seed: string;
  /** Up to a few colors from the work's palette, for the room's accent color. */
  palette: string[];
  /** Whether the sketch animates (worth running live even from a distance). */
  animated: boolean;
  createdAt: number;
};

export type Exhibit2D = ExhibitBase & {
  medium: "2d";
  size: Size2D;
  /** Public image URLs, relative to the museum origin. */
  images: { "1k": string; "2k": string };
};

export type Exhibit = Exhibit2D;

export type Manifest = {
  generatorVersion: number;
  /** Seeds every random choice the building makes. Changing it rehangs the whole museum. */
  layoutSeed: string;
  exhibits: Exhibit[];
};

/** What the lab sends when exhibiting or editing; the server fills in the rest. */
export type ExhibitInput = {
  title: string;
  statement: string;
  wing: string;
  hero: boolean;
  live: boolean;
  /** Longest side in meters. */
  longSide: number;
};

/** The lab's view of its own exhibits. */
export type LabExhibit = ExhibitInput & { id: string; outputId: string; position: number; size: Size2D; createdAt: number };

export const DEFAULT_WING = "Main";
export const MAX_STATEMENT = 2000;

/** Longest side in meters. */
export const SIZE_PRESETS = [
  { label: "Small · 0.8 m", value: 0.8 },
  { label: "Medium · 1.2 m", value: 1.2 },
  { label: "Large · 2 m", value: 2 },
  { label: "Huge · 3 m", value: 3 },
] as const;
export const DEFAULT_LONG_SIDE = 1.2;

/** Image widths stored for the museum, keyed like `Exhibit2D.images`. */
export const IMAGE_SIZES = { "1k": 1024, "2k": 2048 } as const;
export type ImageSize = keyof typeof IMAGE_SIZES;

/** R2 key of a public museum image. Everything the museum serves lives under `museum/`. */
export const imageKey = (exhibitId: string, size: ImageSize) => `museum/${exhibitId}/${size}.webp`;

/** Physical size from the output's pixel aspect ratio and the chosen longest side. */
export function physicalSize(width: number, height: number, longSide: number): Size2D {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return width >= height
    ? { w: round(longSide), h: round((longSide * height) / width) }
    : { w: round((longSide * width) / height), h: round(longSide) };
}

/** Best guess from the code: canvas sketches animate with setUpdate, p5 ones with draw() and no noLoop(). */
export function isAnimated(code: string, engine: Engine): boolean {
  if (engine === "p5") return /function\s+draw\s*\(/.test(code) && !/\bnoLoop\s*\(/.test(code);
  return /\$genart\.setUpdate\s*\(/.test(code);
}

export const cleanWing = (w: unknown) => (typeof w === "string" ? w.trim().slice(0, 60) : "") || DEFAULT_WING;
