import { SRGBColorSpace, Texture, TextureLoader } from "three";

const loader = new TextureLoader();
type Entry = { texture: Promise<Texture>; refs: number; release?: ReturnType<typeof setTimeout> };
const entries = new Map<string, Entry>();

/** How long an unused artwork texture stays on the GPU, in case the visitor turns back. */
const KEEP_MS = 20_000;

/** Loads an artwork image once, however many works ask for it; pair every call with `releaseArt`. */
export function acquireArt(url: string): Promise<Texture> {
  let e = entries.get(url);
  if (!e) {
    e = {
      refs: 0,
      texture: loader.loadAsync(url).then((t) => {
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
        return t;
      }),
    };
    entries.set(url, e);
  }
  e.refs++;
  clearTimeout(e.release);
  return e.texture;
}

/** Frees a texture once nothing has used it for a while (rooms far away unmount their art). */
export function releaseArt(url: string) {
  const e = entries.get(url);
  if (!e || --e.refs > 0) return;
  e.release = setTimeout(() => {
    entries.delete(url);
    void e.texture.then((t) => t.dispose());
  }, KEEP_MS);
}
