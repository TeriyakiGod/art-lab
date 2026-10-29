import type { ModelMessage } from "ai";

export const LOOK_TOOL = "look_at_canvas";

const isImageUrl = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");

/**
 * Workers AI's chat wire can't carry images inside tool results, only in user
 * messages. So a look_at_canvas result (`{ image: dataUrl }`) is rewritten to
 * plain text, and the snapshot follows as a user message right after the
 * tool message. For models that can't see images at all, every image (also
 * ones the user attached) becomes a short text note instead.
 */
export function liftImages(messages: ModelMessage[], vision: boolean): ModelMessage[] {
  const out: ModelMessage[] = [];
  const note = "[A canvas snapshot was here, but this model can't see images. The Balanced model can.]";
  for (const m of messages) {
    if (m.role === "tool") {
      const images: string[] = [];
      const content = m.content.map((part) => {
        if (part.type !== "tool-result" || part.toolName !== LOOK_TOOL) return part;
        const value = part.output.type === "json" ? (part.output.value as { image?: unknown } | null) : null;
        if (!value || !isImageUrl(value.image)) return part;
        images.push(value.image);
        return { ...part, output: { type: "text" as const, value: vision ? "Captured the canvas; the snapshot follows." : note } };
      });
      out.push({ ...m, content });
      if (vision && images.length) {
        out.push({
          role: "user",
          content: [
            { type: "text", text: "Canvas snapshot from look_at_canvas:" },
            ...images.map((url) => ({ type: "image" as const, image: new URL(url) })),
          ],
        });
      }
    } else if (m.role === "user" && !vision && Array.isArray(m.content)) {
      out.push({
        ...m,
        content: m.content.map((part) =>
          part.type === "image" || (part.type === "file" && String(part.mediaType).startsWith("image/")) ? { type: "text" as const, text: note } : part,
        ),
      });
    } else {
      out.push(m);
    }
  }
  return out;
}
