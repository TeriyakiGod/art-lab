import { Hono } from "hono";
import type { Engine } from "../../shared/types";
import { PALETTE_KEY, isHexColor } from "../../shared/palettes";
import {
  GENERATOR_VERSION, IMAGE_SIZES, MAIN_HALL, imageKey, isAnimated,
  type Collection, type Exhibit, type ImageSize, type Manifest,
} from "../../shared/museum/manifest";

// Public and read-only: everything here is visible to anyone. Never read outputs that aren't exhibited,
// and never send a sketch's code unless its exhibit is marked live.
const app = new Hono<{ Bindings: Env }>().basePath("/api");

type Row = {
  id: string; collection_id: string | null; title: string; statement: string; hero: number; live: number; medium: string;
  size: string; position: number; created_at: number;
  code: string; engine: string; seed: string; param_values: string; width: number; height: number;
};

const asEngine = (e: unknown): Engine => (e === "p5" ? "p5" : "canvas");

function toExhibit(r: Row): Exhibit {
  const values = JSON.parse(r.param_values) as Record<string, unknown>;
  const palette = values[PALETTE_KEY];
  const engine = asEngine(r.engine);
  return {
    id: r.id, title: r.title, statement: r.statement, collection: r.collection_id, position: r.position, hero: !!r.hero, live: !!r.live,
    engine, seed: r.seed, animated: isAnimated(r.code, engine), createdAt: r.created_at,
    palette: Array.isArray(palette) ? palette.filter(isHexColor).slice(0, 6) : [],
    medium: "2d",
    size: JSON.parse(r.size),
    images: { "1k": `/api/img/${r.id}/1k`, "2k": `/api/img/${r.id}/2k` },
  };
}

const EXHIBIT_QUERY = `SELECT e.id, e.collection_id, e.title, e.statement, e.hero, e.live, e.medium, e.size, e.position, e.created_at,
  o.code, o.engine, o.seed, o.param_values, o.width, o.height FROM exhibits e JOIN outputs o ON o.id = e.output_id`;

app.get("/manifest", async (c) => {
  const [{ results }, collections] = await Promise.all([
    c.env.DB.prepare(`${EXHIBIT_QUERY} ORDER BY e.position`).all<Row>(),
    c.env.DB.prepare("SELECT id, name, color FROM collections ORDER BY position, created_at").all<Collection>(),
  ]);
  const manifest: Manifest = {
    generatorVersion: GENERATOR_VERSION,
    layoutSeed: c.env.LAYOUT_SEED,
    collections: collections.results.some((x) => x.id === MAIN_HALL)
      ? collections.results
      : [{ id: MAIN_HALL, name: "Main hall", color: "#e8e6f0" }, ...collections.results],
    exhibits: results.filter((r) => r.medium === "2d").map(toExhibit),
  };
  return c.json(manifest, 200, { "cache-control": "public, max-age=60" });
});

/** The code and params to run a live exhibit, for live works only. */
app.get("/exhibits/:id/sketch", async (c) => {
  const r = await c.env.DB.prepare(`${EXHIBIT_QUERY} WHERE e.id = ? AND e.live = 1`).bind(c.req.param("id")).first<Row>();
  if (!r) return c.notFound();
  return c.json({ code: r.code, engine: asEngine(r.engine), seed: r.seed, values: JSON.parse(r.param_values), width: r.width, height: r.height }, 200, {
    "cache-control": "public, max-age=60",
  });
});

app.get("/img/:id/:size", async (c) => {
  const size = c.req.param("size") as ImageSize;
  if (!(size in IMAGE_SIZES)) return c.notFound();
  // Only keys under museum/ are ever read, so private outputs can't leak through here.
  const obj = await c.env.BUCKET.get(imageKey(c.req.param("id"), size));
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", etag: obj.httpEtag },
  });
});

export default app;
