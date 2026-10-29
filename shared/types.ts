/** The runtime a sketch's code is written for. */
export type Engine = "canvas" | "p5";
export const ENGINES: { id: Engine; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "p5", label: "p5.js" },
];

export interface Sketch {
  id: string;
  title: string;
  code: string;
  /** Missing on sketches made before p5 support: treat as "canvas". */
  engine?: Engine;
  seed: string;
  values: Record<string, unknown>;
  width: number;
  height: number;
  updatedAt: number;
  createdAt: number;
}

export interface Version {
  id: string;
  sketchId: string;
  code: string;
  message: string;
  createdAt: number;
}

export interface Palette {
  id: string;
  name: string;
  colors: string[];
  updatedAt: number;
  createdAt: number;
}

export interface Output {
  id: string;
  sketchId: string;
  /** The exact code the output was rendered with. */
  code: string;
  engine: Engine;
  seed: string;
  values: Record<string, unknown>;
  width: number;
  height: number;
  url: string;
  favorite: boolean;
  createdAt: number;
}

export const CHAT_MODELS = [
  // Prices per M tokens (input / output) as of 2026-10. The last two need the Workers Paid plan.
  // `vision`: can look at canvas snapshots.
  { id: "@cf/zai-org/glm-4.7-flash", label: "Fast · GLM 4.7 Flash · $", vision: false }, // $0.06 / $0.40
  { id: "@cf/zai-org/glm-5.3-flash", label: "Balanced · GLM 5.3 Flash · $$", vision: true }, // $0.15 / $0.50
  { id: "@cf/zai-org/glm-5.3", label: "Powerful · GLM 5.3 · $$$", vision: false }, // $1.40 / $4.40
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];
export const DEFAULT_CHAT_MODEL: ChatModelId = "@cf/zai-org/glm-4.7-flash";
export const modelSees = (id: string | undefined) => CHAT_MODELS.some((m) => m.id === id && m.vision);

/** Extra data the client sends with every chat turn. */
export type ChatBody = {
  model?: string;
  sketch?: { title: string; code: string; engine?: Engine; values: Record<string, unknown>; seed: string };
  errors?: string[];
  lessonId?: string;
  /** The sketch was just created from a description on Home: write it from scratch. */
  generate?: boolean;
  /** The sketch is an attempt at a lesson challenge; `hint` is the rung of help asked for. */
  challenge?: { lessonId: string; hint?: HintLevel };
};

/** 1: a nudge, 2: a concrete hint, 3: a worked solution. */
export type HintLevel = 1 | 2 | 3;

/** Code of a sketch created from a description, until the assistant replaces it. */
export const GENERATE_PLACEHOLDER = "// The assistant is writing this sketch from your description…\n";
export const generateKey = (sketchId: string) => `art-lab:generate:${sketchId}`;
