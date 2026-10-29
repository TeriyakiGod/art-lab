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

export interface Output {
  id: string;
  sketchId: string;
  seed: string;
  values: Record<string, unknown>;
  width: number;
  height: number;
  url: string;
  favorite: boolean;
  createdAt: number;
}

export const CHAT_MODELS = [
  { id: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash (fast)" },
  { id: "@cf/zai-org/glm-5.3-flash", label: "GLM 5.3 Flash (paid plan)" },
  { id: "@cf/moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code (paid plan)" },
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
