import { renderToPNG } from "./SketchFrame";
import type { RunConfig } from "./sandbox";

/** Pixels per strip: under iOS Safari's ~16.7 MP canvas cap, and modest on memory. */
const STRIP_PIXELS = 8_000_000;
/** Extra rows rendered above and below each strip, then discarded. */
const OVERLAP = 8;
/** Browsers refuse canvases wider than this. */
export const MAX_EXPORT_SIDE = 16_384;
/** Above this many pixels, export in strips instead of one canvas. */
export const SINGLE_CANVAS_PIXELS = 16_000_000;

type Opts = Omit<RunConfig, "channel" | "mode" | "dpr" | "tile"> & { scale: number };

/**
 * Renders a sketch far larger than one canvas allows: the image is drawn in
 * full-width strips (each its own sandbox run with the same seed, so they line
 * up exactly) and streamed into a PNG encoder, so the whole image never has
 * to exist as one canvas. Needs the sketch to draw through `lab.canvas()`.
 */
export async function renderLargePNG(opts: Opts, onProgress?: (done: number, total: number) => void, stripPixels = STRIP_PIXELS): Promise<Blob> {
  const W = Math.round(opts.width * opts.scale), H = Math.round(opts.height * opts.scale);
  if (W > MAX_EXPORT_SIDE || H > MAX_EXPORT_SIDE) throw new Error(`Max export size is ${MAX_EXPORT_SIDE}px per side`);
  const stripH = Math.max(1, Math.min(H, Math.floor(stripPixels / W) - 2 * OVERLAP));
  const total = Math.ceil(H / stripH);

  const png = new PngStream(W, H);
  const scratch = document.createElement("canvas");
  scratch.width = W;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;

  for (let i = 0; i < total; i++) {
    onProgress?.(i, total);
    const y = i * stripH, h = Math.min(stripH, H - y);
    // Render a few extra rows on each side and drop them: anti-aliasing where
    // shapes are clipped at a canvas edge would otherwise show as a seam.
    const top = Math.min(OVERLAP, y), bottom = Math.min(OVERLAP, H - y - h);
    const blob = await renderToPNG({ ...opts, tile: { x: 0, y: y - top, w: W, h: h + top + bottom } } as Opts);
    const bmp = await createImageBitmap(blob);
    if (bmp.width !== W || bmp.height !== h + top + bottom) {
      bmp.close();
      throw new Error("This sketch doesn't draw with lab.canvas(), so it can't be exported this large");
    }
    scratch.height = h;
    ctx.clearRect(0, 0, W, h);
    ctx.drawImage(bmp, 0, -top);
    bmp.close();
    await png.addRows(ctx.getImageData(0, 0, W, h).data, h);
  }
  onProgress?.(total, total);
  return png.finish();
}

// ---- minimal streaming PNG encoder (RGBA, 8-bit, "Sub" filter) ----------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(parts: Uint8Array<ArrayBuffer>[]) {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const head = new Uint8Array(8);
  const dv = new DataView(head.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) head[4 + i] = type.charCodeAt(i);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32([head.subarray(4), data]));
  return [head, data, crc];
}

class PngStream {
  private parts: BlobPart[] = [];
  private writer: WritableStreamDefaultWriter<BufferSource>;
  private drained: Promise<void>;

  constructor(private width: number, height: number) {
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, adaptive filtering, no interlace
    this.parts.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunk("IHDR", ihdr));
    // "deflate" in CompressionStream is zlib-wrapped, which is what IDAT wants.
    const cs = new CompressionStream("deflate");
    this.writer = cs.writable.getWriter();
    this.drained = (async () => {
      const reader = cs.readable.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.parts.push(...chunk("IDAT", value as Uint8Array<ArrayBuffer>));
      }
    })();
  }

  async addRows(rgba: Uint8ClampedArray, rows: number) {
    const stride = this.width * 4;
    const out = new Uint8Array((stride + 1) * rows);
    for (let y = 0; y < rows; y++) {
      const src = y * stride, dst = y * (stride + 1);
      out[dst] = 1; // Sub: each byte minus the same channel of the pixel to its left
      for (let i = 0; i < stride; i++) out[dst + 1 + i] = rgba[src + i] - (i >= 4 ? rgba[src + i - 4] : 0);
    }
    await this.writer.write(out);
  }

  async finish(): Promise<Blob> {
    await this.writer.close();
    await this.drained;
    this.parts.push(...chunk("IEND", new Uint8Array(0)));
    return new Blob(this.parts, { type: "image/png" });
  }
}
