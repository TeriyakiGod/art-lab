import type { Output } from "../../shared/types";
import { IMAGE_SIZES, type ExhibitInput, type ImageSize, type LabExhibit } from "../../shared/museum/manifest";
import { api, json } from "./api";

export const listExhibits = () => api<LabExhibit[]>("/exhibits");

/** Scales the output's PNG down (never up) to `width` and encodes it as WebP. */
async function toWebp(png: Blob, width: number): Promise<Blob> {
  const bitmap = await createImageBitmap(png);
  const scale = Math.min(1, width / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
}

/** Makes the public museum images in the browser (Workers can't resize images) and creates the exhibit. */
export async function exhibitOutput(output: Output, input: ExhibitInput): Promise<LabExhibit> {
  const res = await fetch(output.url);
  if (!res.ok) throw new Error("Couldn't load the output image.");
  const png = await res.blob();
  const form = new FormData();
  form.set("meta", JSON.stringify({ ...input, outputId: output.id }));
  for (const [size, width] of Object.entries(IMAGE_SIZES) as [ImageSize, number][]) {
    form.set(size, await toWebp(png, width), `${size}.webp`);
  }
  return api<LabExhibit>("/exhibits", { method: "POST", body: form });
}

export const updateExhibit = (id: string, input: ExhibitInput) => api<LabExhibit>(`/exhibits/${id}`, json(input, "PATCH"));
export const removeExhibit = (id: string) => api(`/exhibits/${id}`, { method: "DELETE" });
