import { Hono } from "hono";
import { routeAgentRequest } from "agents";
import { getUser, type User } from "./auth";
import type { Engine, Output, Palette, Sketch, Version } from "../shared/types";
import { MAX_PALETTE_COLORS, isHexColor } from "../shared/palettes";
import {
  IMAGE_SIZES, MAX_STATEMENT, cleanWing, imageKey, physicalSize,
  type ExhibitInput, type ImageSize, type LabExhibit,
} from "../shared/museum/manifest";

export { ChatAgent } from "./agent";

type AppEnv = { Bindings: Env; Variables: { user: User } };
const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  const user = await getUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
});

app.get("/me", (c) => c.json(c.get("user")));

type SketchRow = {
  id: string; title: string; code: string; engine: string; seed: string; param_values: string;
  width: number; height: number; updated_at: number; created_at: number;
};
const toSketch = (r: SketchRow): Sketch => ({
  id: r.id, title: r.title, code: r.code, engine: asEngine(r.engine), seed: r.seed, values: JSON.parse(r.param_values),
  width: r.width, height: r.height, updatedAt: r.updated_at, createdAt: r.created_at,
});

const asEngine = (e: unknown): Engine => (e === "p5" ? "p5" : "canvas");

app.get("/sketches", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM sketches WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500",
  ).bind(c.get("user").id).all<SketchRow>();
  return c.json(results.map(toSketch));
});

// Upsert; the newest updatedAt wins so offline edits from several devices don't clobber newer ones.
app.put("/sketches/:id", async (c) => {
  const s = await c.req.json<Sketch>();
  if (s.id !== c.req.param("id") || typeof s.code !== "string" || s.code.length > 200_000) {
    return c.json({ error: "invalid sketch" }, 400);
  }
  const user = c.get("user").id;
  const res = await c.env.DB.prepare(
    `INSERT INTO sketches (id, user_id, title, code, seed, param_values, width, height, updated_at, created_at, engine)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
     ON CONFLICT(id) DO UPDATE SET title = ?3, code = ?4, seed = ?5, param_values = ?6, width = ?7, height = ?8, updated_at = ?9, engine = ?11
     WHERE sketches.user_id = ?2 AND sketches.updated_at < ?9`,
  ).bind(s.id, user, s.title.slice(0, 200), s.code, s.seed.slice(0, 100), JSON.stringify(s.values ?? {}),
    s.width | 0, s.height | 0, s.updatedAt, s.createdAt, asEngine(s.engine)).run();
  return c.json({ ok: true, changed: res.meta.changes > 0 });
});

app.delete("/sketches/:id", async (c) => {
  const user = c.get("user").id;
  const id = c.req.param("id");
  const { results } = await c.env.DB.prepare("SELECT r2_key FROM outputs WHERE sketch_id = ? AND user_id = ?")
    .bind(id, user).all<{ r2_key: string }>();
  if (results.length) await c.env.BUCKET.delete(results.map((r) => r.r2_key));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM outputs WHERE sketch_id = ? AND user_id = ?").bind(id, user),
    c.env.DB.prepare("DELETE FROM versions WHERE sketch_id = ? AND user_id = ?").bind(id, user),
    c.env.DB.prepare("DELETE FROM sketches WHERE id = ? AND user_id = ?").bind(id, user),
  ]);
  return c.json({ ok: true });
});

app.get("/sketches/:id/versions", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, sketch_id, code, message, created_at FROM versions WHERE sketch_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100",
  ).bind(c.req.param("id"), c.get("user").id).all<{ id: string; sketch_id: string; code: string; message: string; created_at: number }>();
  return c.json(results.map((r): Version => ({ id: r.id, sketchId: r.sketch_id, code: r.code, message: r.message, createdAt: r.created_at })));
});

app.post("/sketches/:id/versions", async (c) => {
  const { code, message } = await c.req.json<{ code: string; message?: string }>();
  const user = c.get("user").id;
  const owned = await c.env.DB.prepare("SELECT 1 FROM sketches WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user).first();
  if (!owned) return c.json({ error: "sync the sketch first" }, 409);
  const v: Version = { id: crypto.randomUUID(), sketchId: c.req.param("id"), code, message: (message ?? "").slice(0, 500), createdAt: Date.now() };
  await c.env.DB.prepare("INSERT INTO versions (id, sketch_id, user_id, code, message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(v.id, v.sketchId, user, v.code, v.message, v.createdAt).run();
  return c.json(v);
});

type OutputRow = {
  id: string; sketch_id: string; code: string; engine: string; seed: string; param_values: string; width: number; height: number;
  favorite: number; created_at: number;
};
const toOutput = (r: OutputRow): Output => ({
  id: r.id, sketchId: r.sketch_id, code: r.code, engine: asEngine(r.engine), seed: r.seed, values: JSON.parse(r.param_values), width: r.width, height: r.height,
  url: `/api/outputs/${r.id}/image`, favorite: !!r.favorite, createdAt: r.created_at,
});

app.get("/outputs", async (c) => {
  const sketchId = c.req.query("sketch");
  const user = c.get("user").id;
  const stmt = sketchId
    ? c.env.DB.prepare("SELECT * FROM outputs WHERE user_id = ? AND sketch_id = ? ORDER BY created_at DESC LIMIT 200").bind(user, sketchId)
    : c.env.DB.prepare("SELECT * FROM outputs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").bind(user);
  const { results } = await stmt.all<OutputRow>();
  return c.json(results.map(toOutput));
});

// multipart: image (PNG) + meta (JSON with sketchId, code, seed, values, width, height)
app.post("/outputs", async (c) => {
  const form = await c.req.formData();
  const image = form.get("image");
  const meta = JSON.parse(String(form.get("meta") ?? "{}"));
  if (!(image instanceof File) || image.type !== "image/png" || image.size > 25_000_000) {
    return c.json({ error: "expected a PNG under 25 MB" }, 400);
  }
  const user = c.get("user").id;
  const owned = await c.env.DB.prepare("SELECT 1 FROM sketches WHERE id = ? AND user_id = ?").bind(meta.sketchId, user).first();
  if (!owned) return c.json({ error: "sync the sketch first" }, 409);
  const id = crypto.randomUUID();
  const key = `${user}/${meta.sketchId}/${id}.png`;
  await c.env.BUCKET.put(key, image.stream(), { httpMetadata: { contentType: "image/png" } });
  const row: OutputRow = {
    id, sketch_id: meta.sketchId, code: String(meta.code ?? ""), engine: asEngine(meta.engine), seed: String(meta.seed), param_values: JSON.stringify(meta.values ?? {}),
    width: meta.width | 0, height: meta.height | 0, favorite: 0, created_at: Date.now(),
  };
  await c.env.DB.prepare(
    "INSERT INTO outputs (id, sketch_id, user_id, code, engine, seed, param_values, width, height, r2_key, favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
  ).bind(id, row.sketch_id, user, row.code, row.engine, row.seed, row.param_values, row.width, row.height, key, row.created_at).run();
  return c.json(toOutput(row));
});

app.get("/outputs/:id/image", async (c) => {
  const row = await c.env.DB.prepare("SELECT r2_key FROM outputs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("user").id).first<{ r2_key: string }>();
  const obj = row && (await c.env.BUCKET.get(row.r2_key));
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable" },
  });
});

app.patch("/outputs/:id", async (c) => {
  const { favorite } = await c.req.json<{ favorite: boolean }>();
  await c.env.DB.prepare("UPDATE outputs SET favorite = ? WHERE id = ? AND user_id = ?")
    .bind(favorite ? 1 : 0, c.req.param("id"), c.get("user").id).run();
  return c.json({ ok: true });
});

app.delete("/outputs/:id", async (c) => {
  const user = c.get("user").id;
  const row = await c.env.DB.prepare("SELECT r2_key FROM outputs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user).first<{ r2_key: string }>();
  if (row) {
    const exhibit = await c.env.DB.prepare("SELECT id FROM exhibits WHERE output_id = ?").bind(c.req.param("id")).first<{ id: string }>();
    if (exhibit) await deleteExhibitImages(c.env, exhibit.id);
    await c.env.BUCKET.delete(row.r2_key);
    // The exhibit row goes with it (ON DELETE CASCADE).
    await c.env.DB.prepare("DELETE FROM outputs WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user).run();
  }
  return c.json({ ok: true });
});

// Exhibits: outputs shown in the public museum. The museum Worker only reads them.
type ExhibitRow = {
  id: string; output_id: string; wing: string; title: string; statement: string; hero: number; live: number;
  size: string; position: number; created_at: number;
};
const toLabExhibit = (r: ExhibitRow): LabExhibit => {
  const size = JSON.parse(r.size) as LabExhibit["size"];
  return {
    id: r.id, outputId: r.output_id, wing: r.wing, title: r.title, statement: r.statement, hero: !!r.hero, live: !!r.live,
    size, longSide: Math.max(size.w, size.h), position: r.position, createdAt: r.created_at,
  };
};

const deleteExhibitImages = (env: Env, id: string) =>
  env.BUCKET.delete((Object.keys(IMAGE_SIZES) as ImageSize[]).map((s) => imageKey(id, s)));

/** Validates what the lab sends; null if it's unusable. */
function parseExhibitInput(v: Partial<ExhibitInput>): ExhibitInput | null {
  const title = typeof v.title === "string" ? v.title.trim().slice(0, 120) : "";
  const longSide = Number(v.longSide);
  if (!title || !(longSide >= 0.2 && longSide <= 10)) return null;
  return {
    title, wing: cleanWing(v.wing), longSide, hero: !!v.hero, live: v.live !== false,
    statement: typeof v.statement === "string" ? v.statement.trim().slice(0, MAX_STATEMENT) : "",
  };
}

/**
 * Positions are one sequence across all wings: the museum places works in this order, so a new
 * work (or one moved to another wing) comes last and never moves the rooms of older ones.
 */
const nextPosition = async (env: Env) =>
  ((await env.DB.prepare("SELECT MAX(position) AS p FROM exhibits").first<{ p: number | null }>())?.p ?? -1) + 1;

app.get("/exhibits", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM exhibits WHERE user_id = ? ORDER BY wing, position")
    .bind(c.get("user").id).all<ExhibitRow>();
  return c.json(results.map(toLabExhibit));
});

// multipart: meta (JSON: outputId + ExhibitInput) + one WebP per IMAGE_SIZES key, resized in the browser
app.post("/exhibits", async (c) => {
  const form = await c.req.formData();
  const meta = JSON.parse(String(form.get("meta") ?? "{}")) as Partial<ExhibitInput> & { outputId?: string };
  const input = parseExhibitInput(meta);
  const images = (Object.keys(IMAGE_SIZES) as ImageSize[]).map((s) => [s, form.get(s)] as const);
  if (!input || images.some(([, f]) => !(f instanceof File) || f.type !== "image/webp" || f.size > 15_000_000)) {
    return c.json({ error: "expected a title, a size and WebP images" }, 400);
  }
  const user = c.get("user").id;
  const output = await c.env.DB.prepare("SELECT width, height FROM outputs WHERE id = ? AND user_id = ?")
    .bind(meta.outputId, user).first<{ width: number; height: number }>();
  if (!output) return c.json({ error: "output not found" }, 404);
  if (await c.env.DB.prepare("SELECT 1 FROM exhibits WHERE output_id = ?").bind(meta.outputId).first()) {
    return c.json({ error: "already exhibited" }, 409);
  }

  const id = crypto.randomUUID();
  for (const [s, f] of images) {
    await c.env.BUCKET.put(imageKey(id, s), (f as File).stream(), { httpMetadata: { contentType: "image/webp" } });
  }
  const now = Date.now();
  const assets = Object.fromEntries(images.map(([s]) => [s, imageKey(id, s)]));
  const row: ExhibitRow = {
    id, output_id: meta.outputId!, wing: input.wing, title: input.title, statement: input.statement, hero: +input.hero, live: +input.live,
    size: JSON.stringify(physicalSize(output.width, output.height, input.longSide)), position: await nextPosition(c.env), created_at: now,
  };
  await c.env.DB.prepare(
    `INSERT INTO exhibits (id, output_id, user_id, wing, title, statement, hero, live, medium, size, assets, position, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2d', ?, ?, ?, ?, ?)`,
  ).bind(id, row.output_id, user, row.wing, row.title, row.statement, row.hero, row.live, row.size, JSON.stringify(assets), row.position, now, now).run();
  return c.json(toLabExhibit(row));
});

app.patch("/exhibits/:id", async (c) => {
  const input = parseExhibitInput(await c.req.json<Partial<ExhibitInput>>());
  if (!input) return c.json({ error: "expected a title and a size" }, 400);
  const user = c.get("user").id;
  const row = await c.env.DB.prepare(
    "SELECT e.*, o.width, o.height FROM exhibits e JOIN outputs o ON o.id = e.output_id WHERE e.id = ? AND e.user_id = ?",
  ).bind(c.req.param("id"), user).first<ExhibitRow & { width: number; height: number }>();
  if (!row) return c.notFound();
  // Moving to another wing appends there, so the new wing's existing rooms stay put.
  const position = input.wing === row.wing ? row.position : await nextPosition(c.env);
  const updated: ExhibitRow = {
    ...row, wing: input.wing, title: input.title, statement: input.statement, hero: +input.hero, live: +input.live,
    size: JSON.stringify(physicalSize(row.width, row.height, input.longSide)), position,
  };
  await c.env.DB.prepare(
    "UPDATE exhibits SET wing = ?, title = ?, statement = ?, hero = ?, live = ?, size = ?, position = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  ).bind(updated.wing, updated.title, updated.statement, updated.hero, updated.live, updated.size, position, Date.now(), row.id, user).run();
  return c.json(toLabExhibit(updated));
});

app.delete("/exhibits/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT id FROM exhibits WHERE id = ? AND user_id = ?").bind(id, c.get("user").id).first();
  if (row) {
    await deleteExhibitImages(c.env, id);
    await c.env.DB.prepare("DELETE FROM exhibits WHERE id = ?").bind(id).run();
  }
  return c.json({ ok: true });
});

type PaletteRow = { id: string; name: string; colors: string; updated_at: number; created_at: number };
const toPalette = (r: PaletteRow): Palette => ({ id: r.id, name: r.name, colors: JSON.parse(r.colors), updatedAt: r.updated_at, createdAt: r.created_at });

app.get("/palettes", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM palettes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200")
    .bind(c.get("user").id).all<PaletteRow>();
  return c.json(results.map(toPalette));
});

// Upsert, newest updatedAt wins (same rule as sketches).
app.put("/palettes/:id", async (c) => {
  const p = await c.req.json<Palette>();
  const ok = p.id === c.req.param("id") && typeof p.name === "string" && Array.isArray(p.colors)
    && p.colors.length > 0 && p.colors.length <= MAX_PALETTE_COLORS && p.colors.every(isHexColor);
  if (!ok) return c.json({ error: "invalid palette" }, 400);
  const res = await c.env.DB.prepare(
    `INSERT INTO palettes (id, user_id, name, colors, updated_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET name = ?3, colors = ?4, updated_at = ?5
     WHERE palettes.user_id = ?2 AND palettes.updated_at < ?5`,
  ).bind(p.id, c.get("user").id, p.name.slice(0, 80), JSON.stringify(p.colors), p.updatedAt, p.createdAt).run();
  return c.json({ ok: true, changed: res.meta.changes > 0 });
});

app.delete("/palettes/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM palettes WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.get("user").id).run();
  return c.json({ ok: true });
});

app.get("/progress", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT lesson_id FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL")
    .bind(c.get("user").id).all<{ lesson_id: string }>();
  return c.json(results.map((r) => r.lesson_id));
});

app.put("/progress/:lessonId", async (c) => {
  await c.env.DB.prepare(
    "INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET completed_at = excluded.completed_at",
  ).bind(c.get("user").id, c.req.param("lessonId"), Date.now()).run();
  return c.json({ ok: true });
});

/** Chat agents are named `<userId>--<sketchId>`; a user may only reach their own. */
async function guardAgent(request: Request, env: Env, name: string) {
  const user = await getUser(request, env);
  if (!user || !name.startsWith(`${user.id}--`)) return new Response("forbidden", { status: 403 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/agents/")) {
      return (
        (await routeAgentRequest(request, env, {
          onBeforeConnect: (req, route) => guardAgent(req, env, route.name),
          onBeforeRequest: (req, route) => guardAgent(req, env, route.name),
        })) ?? new Response("not found", { status: 404 })
      );
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
