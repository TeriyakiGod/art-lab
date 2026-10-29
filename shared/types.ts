export interface Sketch {
  id: string;
  title: string;
  code: string;
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
  { id: "@cf/zai-org/glm-4.7-flash", label: "Fast · GLM 4.7 Flash · $" }, // $0.06 / $0.40
  { id: "@cf/zai-org/glm-5.3-flash", label: "Balanced · GLM 5.3 Flash · $$" }, // $0.15 / $0.50
  { id: "@cf/zai-org/glm-5.3", label: "Powerful · GLM 5.3 · $$$" }, // $1.40 / $4.40
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];
export const DEFAULT_CHAT_MODEL: ChatModelId = "@cf/zai-org/glm-4.7-flash";

/** Extra data the client sends with every chat turn. */
export type ChatBody = {
  model?: string;
  sketch?: { title: string; code: string; values: Record<string, unknown>; seed: string };
  errors?: string[];
  lessonId?: string;
};
