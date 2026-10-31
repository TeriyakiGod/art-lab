import { SRGBColorSpace, Texture, TextureLoader } from "three";

const loader = new TextureLoader();
const cache = new Map<string, Promise<Texture>>();

/** Loads an artwork image once, however many times it's asked for. */
export function loadArt(url: string): Promise<Texture> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((t) => {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    });
    cache.set(url, p);
  }
  return p;
}
