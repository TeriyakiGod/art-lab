# Art Lab Museum — plan

A public, first-person 3D museum for the art made in Art Lab. Guests walk through a building
that the computer generates from the collection: add a piece in the lab and the museum grows a
wall, a room or a whole wing to hold it. Later, guests see each other walking around.

Working name: **Museum**. It takes over **`art.kacperochnik.eu`** (public, no Cloudflare Access),
and the lab moves to **`lab.art.kacperochnik.eu`** (still behind Access). See §12 for the move.

---

## 1. What makes this museum different

The pieces aren't photos of paintings. Each one is a seeded program (a GenArtAPI sketch), and
the plan is built around that:

- **Live works.** Far away a piece shows a still image. When you walk up to it, the real
  sketch starts running on the wall, so animated pieces move.
- **Re-roll.** Focus on a piece and press `R` to run it with a new seed. Each guest gets their
  own version of the work, which a painting can't do. A "Show original" button switches back.
- **The building is generative too.** Room shapes, ceiling patterns, light colors and the
  ambient sound all come from the same seeded randomness and the palettes of the art in them.

## 2. The look: ultra-modern, built from the art

Mood: a dark, quiet space where the art is the only bright thing. Think a research lab mixed
with a night-time art installation, not a white-walled gallery.

| Element | Treatment |
|---|---|
| Floor | Polished dark concrete with blurred reflections (screen-space reflections) |
| Walls | Matte graphite panels in a modular grid, with thin shadow gaps between them |
| Light | No visible lamps. Light comes from the art, thin LED lines in the floor and ceiling, and soft light from above |
| Accent color | Each room takes its accent color from the palettes of its pieces (`lab.palette()` data is already stored) |
| Ceiling | Procedural: Voronoi cells, flow-field fins or a grid of light, depending on the room type |
| Atmosphere | Light fog, bloom on light sources, film grain, AgX tone mapping |
| Frames | No frames. Works float a few cm off the wall with a soft glow behind them. Square works get a thin floating plinth |
| Labels | Minimal floating text (one variable font, e.g. Inter or Geist) that fades in as you approach: title, date, seed, engine |
| Sound | A generative ambient drone per room (Web Audio), stereo-positioned, crossfading between rooms. Muted by default with a clear toggle |
| Transitions | Doorways are thin bright frames; passing through one shifts the accent color |

Room types (the generator picks among them):

1. **Gallery**: a rectangular room with works along the walls; the most common type.
2. **Atrium**: a tall space with one large hero piece (the newest or a pinned favorite). Where you spawn.
3. **Corridor**: a narrow walkway with light lines; connects wings and holds small works or variations.
4. **Mirror room**: one animated work reflected endlessly by mirrored walls (for animated pieces).
5. **Series room**: a long wall showing one sketch's variations side by side (uses the existing Variations data).

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| App shell | Vite + React 19 + TypeScript | Same as Art Lab, so code and habits carry over |
| 3D | **three.js r187+** via **React Three Fiber v9** + **drei** | The standard React 3D stack; lots of examples, components and help |
| Renderer | three's `WebGPURenderer` (it falls back to WebGL2 on its own) | Faster on modern browsers; post effects are written in TSL, three's shader language |
| Post effects | three's TSL nodes: bloom, ambient occlusion (GTAO), SSR, film grain | Built in to three for WebGPU, so no extra library. (drei's `MeshReflectorMaterial` is WebGL-only, so SSR does reflections instead) |
| Physics and movement | **Rapier** (`@react-three/rapier`) with its kinematic character controller | Proper capsule collision, sliding along walls, steps and ramps; the current standard for R3F |
| Controls | Pointer lock + WASD/mouse on desktop; virtual joystick + drag-to-look on touch; gamepad | One input layer turns all of these into the same "intent" (see §6) |
| State | `zustand` for UI, **Koota** (pmndrs ECS) for players and entities | An ECS keeps local and remote players the same kind of thing, which multiplayer needs |
| Multiplayer (later) | **Cloudflare Durable Objects** with **PartyServer**; `partysocket` on the client | Fits the existing Cloudflare setup; one DO per museum instance; WebSocket hibernation keeps idle rooms free |
| Hosting | Second Cloudflare Worker (`art-museum`) + static assets, in the same repo | Public, separate from the Access-protected lab, but shares D1 and R2 |
| VR (stretch) | `@react-three/xr` | The same scene works in a headset with little extra work |

## 4. Architecture

```
art-lab repo
├─ src/, worker/          existing lab (behind Access)  ── adds "Exhibit" controls
├─ shared/                existing shared code
│   └─ museum/            NEW, used by the lab, the museum and the server
│       ├─ manifest.ts      Exhibit and Manifest types
│       ├─ generate.ts      seeded floor-plan generator (pure, deterministic)
│       ├─ floorplan.ts     2D grid queries: walkable? which room? (server checks use it)
│       └─ protocol.ts      multiplayer message types (versioned)
└─ museum/                NEW public app; an npm workspace with its own package.json
    ├─ src/
    │   ├─ engine/          input, character controller, fixed-step loop, ECS
    │   ├─ world/           turns the floor plan into meshes; room types; materials
    │   ├─ art/             artwork textures, live sketch runner, LOD
    │   ├─ ui/              HUD, labels, focus mode, menus, settings
    │   └─ net/             NetAdapter: LocalAdapter now, PartyAdapter later
    └─ worker/            public read-only API (+ the Durable Object in phase 5)
```

**Why one repo:** the museum reads the lab's D1 tables, shares the generator and protocol code,
and reuses the lab's sketch runtime, so a schema change and the code that reads it land in one
commit. `museum/` is an npm workspace, so three.js and Rapier never enter the lab's install. The
deploy workflow gets two jobs with path filters: `museum/**` deploys the museum, lab paths deploy
the lab, and `shared/**` or `migrations/**` deploy both. The museum only talks to the lab through
the manifest API and `shared/museum/`, so it can still be split out later.

**Data flow:**

1. In the lab you mark an output (or a sketch) as **exhibited** and give it a wing, a title and an
   optional statement.
2. The museum Worker serves `GET /api/manifest`: a small JSON list of exhibited works (id, title,
   wing, medium, physical size, palette, asset URLs, whether it animates, code hash) plus a
   `layoutSeed` and `generatorVersion`.
   Edge-cached; refreshed on exhibit changes.
3. The client runs `generate(manifest)` to get a floor plan, then builds the 3D world from it.
   **The building is never stored.** Every guest (and the server) computes the same plan from the
   same manifest.

### Database changes (new migration in the lab)

```sql
CREATE TABLE exhibits (
  id TEXT PRIMARY KEY,
  output_id TEXT NOT NULL REFERENCES outputs(id) ON DELETE CASCADE,
  wing TEXT NOT NULL DEFAULT 'main',      -- groups works into wings (series, theme, year…)
  title TEXT NOT NULL,
  statement TEXT NOT NULL DEFAULT '',
  hero INTEGER NOT NULL DEFAULT 0,        -- candidate for an atrium
  live INTEGER NOT NULL DEFAULT 1,        -- may run the sketch live in the museum
  medium TEXT NOT NULL DEFAULT '2d',      -- '2d' now; '3d' later (see §9)
  size TEXT NOT NULL,                     -- JSON, meters: {"w":1.2,"h":1.2} or {"w":..,"h":..,"d":..}
  assets TEXT NOT NULL DEFAULT '{}',      -- JSON of R2 keys: {"img1k":..,"img2k":..} later {"glb":..,"poster":..}
  position INTEGER NOT NULL,              -- order within the wing; only ever appended
  created_at INTEGER NOT NULL
);
CREATE INDEX exhibits_wing ON exhibits(wing, position);
```

On exhibit, the lab also renders and uploads two image sizes (1024 px and 2048 px, WebP/AVIF) to a
public `museum/` prefix in R2, so the museum never reads private outputs.

## 5. Procedural generation

### Goals

- **Deterministic**: same manifest + seed ⇒ identical building on every device and on the server.
- **Stable when it grows**: adding a piece must not move rooms guests already know. New art fills
  free wall space in the newest room of its wing, or grows a new room off that wing.
- **Always walkable**: every room reachable, no dead ends without art, doors wide enough.
- **Readable**: wings feel like places; you can find your way back to the atrium.

### Algorithm (grid-based growth)

The building lives on a 2D grid of 1 m cells (single floor at first; floors stack later).

1. **Atrium** is placed at the origin. Hero works go here.
2. **Wings** branch from the atrium's doors in a seeded order, one per `wing` value, sorted by the
   date the wing was first used (so old wings never move).
3. Works are taken **in `position` order**, one sequence across all wings (a new work, or one
   moved to another wing, gets the next number), and each goes into its wing's current room
   until that room's slots run out. Placing one at a time across the whole museum is what keeps
   the plan stable: a room's position only depends on rooms created before it. Every room has two kinds of slot, from day one: **wall slots**
   (measured in meters along the walls: a work needs its width plus spacing) and **floor slots**
   (round footprints in the open floor, with a walking path kept clear around them). 2D works use
   wall slots; 3D works will use floor slots. Phase 1 only fills wall slots, but rooms already
   reserve their floor zones so 3D works can arrive later without moving anything.
4. When a room is full, the generator **grows a new room** off a free exit of the wing's last
   room: it tries corridor lengths and room sizes from a seeded list, keeps the first that fits the
   grid without touching anything and has wall space for the work that needs it, and connects it
   with a corridor. Every room reserves its exits when it's created (blank wall until used), so a
   doorway opening later never covers a work.
5. Room type is chosen from what it will hold: many variations of one sketch ⇒ series room;
   one animated work ⇒ mirror room; mostly 3D works ⇒ sculpture hall; one very large 3D work ⇒
   immersive room; otherwise a gallery.
6. Every random choice uses a PRNG seeded from `hash(layoutSeed, wing, roomIndex)`, never from a
   shared running stream. That's what makes the plan stable: room 7 of the "Flow fields" wing
   always rolls the same dice, whatever happens in other wings.

The output is a `FloorPlan`: rooms (cells, type, accent color), doors, wall segments, art slots
with exact positions, and a spawn point. A property test checks the stability promise: for
random manifests, `generate(first N works)` must be a prefix of `generate(first N+1)`.

### From plan to 3D

- Walls, floors and ceilings are built per room from the wall segments, merged into one geometry
  per room and material (a handful of draw calls per room).
- Repeated parts (light strips, panel seams, ceiling fins) are instanced.
- Rapier colliders come straight from the wall segments (cuboids), not from the visual meshes.
- Lighting is mostly baked into materials (emissive strips, an environment map per room type)
  with few real lights, because lights are expensive and the layout can't be pre-baked.

### Streaming

The rooms form a graph (rooms connected by doors). Only the current room and its neighbors within
two doors are built and drawn; rooms further away are dropped. Art textures stream in by distance.
This keeps memory flat however large the collection gets.

## 6. Movement and interaction

- **Fixed-step simulation (60 Hz)**, separate from rendering. Input becomes an `Intent`
  (`move: vec2, look: vec2, jump, interact`) each tick; the character controller applies it. This
  is exactly the shape a networked game needs, so multiplayer slots in later without rewrites.
- Walk speed ~1.4 m/s, run (Shift) ~3 m/s, gentle head-bob (off by default), eye height 1.65 m.
- **Look at a work** (crosshair over it within ~4 m): the label fades in.
- **Focus (`E` / tap)**: the camera glides to a good viewing spot, the cursor is released,
  and a side panel shows title, statement, seed, params and palette. Buttons: Re-roll, Show original,
  Fullscreen, Copy link.
- **Deep links**: `museum.kacperochnik.eu/#/w/<exhibitId>` spawns you in front of that work.
- **Map (`M`)**: a minimal top-down map from the floor plan with a "you are here" marker.
- **Accessibility**: a "glide mode" that moves you from work to work with arrow keys (no free
  movement needed), reduced motion, subtitles for audio, adjustable look speed, and a plain 2D
  gallery view at `/list` as a fallback for devices without WebGL.

## 7. Showing the art

- Each exhibit is one chosen output: the exact seed and params you picked. Works whose `live`
  switch is off are images only, and their code never leaves the server.
- **Still**: each work is a texture on a plane; 1024 px when far, 2048 px when near. Mipmaps and
  anisotropic filtering keep detail at angles.
- **Live**: when you're within ~3 m of a work marked `live`, the museum runs its sketch in a
  hidden **sandboxed iframe** (the lab's existing sandbox: opaque origin, no network). The iframe
  sends frames back as `ImageBitmap`s over `postMessage` (transferable, so no copying), and the
  museum puts them on the wall texture. At most 2–3 live sketches at once; frame rate is capped
  at 30 fps for the wall.
- The sandbox should be served from its own domain first (open issue #29), since the museum is
  public.

## 8. Built for multiplayer from the start

Multiplayer arrives in phase 5, but these choices are made in phase 1 so it won't need a rewrite:

1. **Every player is an ECS entity** with `Transform`, `Velocity`, `Avatar` and an
   `InputSource` (keyboard, network). The local player is not special-cased in rendering.
2. **`NetAdapter` interface** (`connect`, `sendState`, `onPlayers`, `onEvent`). Phase 1 ships
   `LocalAdapter` (does nothing); phase 5 adds `PartyAdapter`.
3. **Deterministic world** from a shared generator, so the server only needs the manifest version
   to know the layout. It can reject impossible positions (inside walls, too fast) using
   `floorplan.ts` without running physics.
4. **Versioned binary protocol** in `shared/museum/protocol.ts`.

### Phase 5 design

- **One Durable Object per museum instance** (`MuseumRoom`), built with PartyServer and
  WebSocket hibernation. A lobby DO hands out instances, around 50 guests each, and opens new
  ones as they fill. Friends can join the same one via a link.
- Clients send their position and look direction **15 times a second**, packed small (ids,
  quantized floats: about 20 bytes). The DO broadcasts the updates to everyone, ideally only those
  in nearby rooms (interest management by room graph).
- Clients show remote players **~100 ms in the past**, interpolating between updates, so movement
  looks smooth despite network jitter.
- **Avatars**: abstract floating shapes (a glowing capsule or a slowly turning polyhedron) tinted
  with a color the guest picks; a name tag; a soft light beam showing where they're looking. This
  fits the look and needs no character models.
- **Social features, in order**: presence → emotes (a few reactions that float up) → "follow
  guest" → text chat. Chat needs the moderation work from issue #21 first.
- **Shared moments (later)**: the owner can run a "live tour" where every guest sees the same
  re-roll at once.

## 9. Ready for 3D art

3D sketches in the lab and 3D works in the museum come later, but the plan leaves room for them
now so they slot in without rebuilding either app.

### What a 3D sketch is

A 3D sketch is still a seeded GenArtAPI program running in the lab's sandbox (no network, opaque
origin). The difference is what it produces: instead of drawing pixels, it **describes a scene**
through a small `lab3d` API: meshes (vertex and index arrays), instanced copies, lines, points,
material settings (color, roughness, metalness, emissive) and, for animated works, per-frame
updates to transforms or vertices. A new engine, `three`, joins `canvas` and `p5` in the lab's
engine list.

The sandbox sends that scene description out as typed arrays over `postMessage` (transferable,
so no copying). The host page, lab or museum, builds the three.js objects itself.

Why a scene description rather than letting sketches draw with WebGL directly:

- **Safe.** Sketch code never runs in the museum page. It can only hand over numbers.
- **It belongs in the room.** The museum lights, shadows, reflects and fogs the object like
  everything else. A sketch rendering its own picture would look like a flat cut-out.
- **Multiplayer for free.** The same seed gives the same geometry on every guest's device, and a
  shared server clock can keep animated works in sync, so everyone sees the same moment.
- **One renderer, two places.** A shared `ArtObject` component (in `shared/`, R3F) draws the scene
  description. The lab's 3D studio and the museum both use it, so what you see in the lab is what
  guests see.

### How 3D works are shown

| Display | Used for | How |
|---|---|---|
| **Plinth** | Objects up to ~1.5 m | On a floating plinth in a floor slot, with a spotlight and contact shadow; guests walk around it |
| **Large sculpture** | Room-sized objects | Fills the center of a sculpture hall, with a collider so guests walk around, not through |
| **Immersive room** | Environments | The work *is* the room: the generator leaves an empty shell and the art fills it; guests walk inside |
| **Wall screen** | 3D work that's really a film | Rendered to a texture on a wall, like 2D live art |

**Loading in steps, like 2D works:** from far away a poster image on a billboard; closer, a
**GLB snapshot** (the geometry exported once when you exhibit it, compressed with meshopt and
KTX2 textures, stored in R2); within a few meters, the live sketch takes over for animation and
re-roll. Works with `live` off stop at the GLB, so their code stays private.

The GLB snapshot also gives a free extra: a "view in AR" button on phones later, and the same
file works in WebXR.

### What phase 0 and 1 do now so 3D fits later

1. `medium`, `size` (in meters, with depth) and `assets` (JSON, not fixed image columns) in the
   `exhibits` table and the manifest.
2. The manifest type is a union on `medium`, so adding `'3d'` is a new case, not a schema rewrite.
3. The generator reserves floor slots in every room (§5) and keeps them empty for now.
4. The museum draws exhibits through a **display registry** (`medium` → component). Phase 1
   registers only `WallArt`; 3D adds `PlinthArt`, `SculptureArt` and `ImmersiveArt`.
5. Colliders come from each work's size, not from its geometry, so a heavy 3D mesh never slows
   physics.
6. `generatorVersion` in the manifest: when 3D room types arrive, it's a deliberate version bump
   rather than a silent layout change.

### Later phases

- **Lab: 3D mode.** The `three` engine, the `lab3d` API, the shared `ArtObject` renderer, an
  orbit-camera preview, GLB export, lessons on 3D basics (meshes, normals, instancing, lighting).
- **Museum: 3D works.** The plinth, sculpture and immersive displays, sculpture-hall and
  immersive room types, spotlights within the light budget, live 3D with re-roll.

## 10. Performance targets

| Target | Budget |
|---|---|
| Mid-range laptop | 60 fps at 1080p, all effects on |
| Recent phone | 30–60 fps with reduced effects (no SSR, half-resolution bloom) |
| First view | Under 3 s on broadband: show the atrium first, load the rest after |
| Draw calls | Under ~300 visible |
| JS bundle | Under ~1 MB gzip for the first view (Rapier WASM loaded in parallel) |

A quality setting (Auto / Low / High) is picked from a quick GPU benchmark on the first visit and
can be changed.

## 11. Phases

| Phase | What ships | Done when |
|---|---|---|
| **0. Groundwork** | Lab moved to `lab.art.kacperochnik.eu` (§12); `exhibits` table; Exhibit button and wing picker in the lab's gallery; public image upload; `museum/` workspace and public Worker on `art.kacperochnik.eu` with a manifest API; split deploy jobs | The manifest URL lists exhibited works publicly; the lab works at its new address, still private |
| **1. Walkable museum** | Generator (wall and reserved floor slots) + stability tests; floor plan → 3D (gallery, atrium, corridor); display registry with `WallArt`; Rapier controller; desktop controls; labels; focus mode; deep links | You can walk through every exhibited work in a plain-looking building |
| **2. Look and feel** | Materials, accent colors from palettes, procedural ceilings, LED lines, SSR, bloom, fog, ambient sound, doorway transitions, loading screen | It looks like the brief in §2 |
| **3. Live art and scale** | Live sketch runner, re-roll, series and mirror rooms, room streaming, texture LOD, quality settings | 100+ works stay smooth; animated works move |
| **4. Everyone's device** | Touch controls, gamepad, glide mode, `/list` fallback, map, accessibility pass | Works on phones and with keyboard only |
| **5. Multiplayer** | `MuseumRoom` DO, lobby, `PartyAdapter`, avatars, interpolation, emotes | Two browsers see each other walk around |
| **6. Lab: 3D mode** | `three` engine and `lab3d` scene API in the sandbox; shared `ArtObject` renderer; orbit preview; GLB export on exhibit; 3D lessons | You can write a seeded 3D sketch in the lab and exhibit it |
| **7. Museum: 3D works** | Plinth, sculpture and immersive displays; sculpture-hall and immersive room types; GLB → live loading; synced animation clock | 3D works stand in the museum and guests walk around them |
| **8. Stretch** | Text chat (after moderation), owner tours, multiple floors, WebXR and AR view, visitor counts | — |

Phases 0–2 are the minimum to show the museum publicly. Each phase becomes a GitHub milestone with
issues, as with the lab.

## 12. Decisions

Settled 2026-10-31:

| Question | Decision |
|---|---|
| Repo | Same repo as the lab; `museum/` is an npm workspace with its own deploy job |
| Domains | Museum at `art.kacperochnik.eu` (public); lab moves to `lab.art.kacperochnik.eu` (Access) |
| What an exhibit is | One chosen output (fixed seed and params); guests can still re-roll |
| Sketch code | Sent to guests for live art, with a per-work `live` switch (on by default; off = image only) |
| Wings | A tag you pick when exhibiting |
| Renderer | `WebGPURenderer` (falls back to WebGL2 itself); switching to `WebGLRenderer` stays cheap early on |
| Guest identity (phase 5) | Anonymous name + color to start; sign-in after Better Auth (#17) |
| 3D art (phases 6–7) | 3D sketches describe a scene that the host page renders (not raw WebGL); schema, generator and display registry leave room for it from phase 0 |

Still open: the museum's name (phase 2), and whether touch controls move up to phase 1.

### Moving the lab to `lab.art.kacperochnik.eu`

Things this touches, and the order that avoids the museum ever being stuck behind Access or the
lab ever being public:

1. **Sync the lab first.** The lab is local-first: edits sit in IndexedDB and sync to D1 in the
   background. Browser storage belongs to the old address, so open the lab on every device and let
   it finish syncing (no pending edits) before the move. Sketches, outputs, palettes and lesson
   progress come back from D1 at the new address; only small UI preferences (pane widths, chosen
   model) reset.
2. **Access**: edit the existing Access application and **add** `lab.art.kacperochnik.eu` as a
   second hostname. Editing (not recreating) keeps the AUD tag, so `ACCESS_AUD` stays the same.
3. **Deploy the lab** with `routes` changed to `lab.art.kacperochnik.eu` (custom domain). A Workers
   custom domain gets its own certificate automatically, so the two-level subdomain works without
   Advanced Certificate Manager (Universal SSL alone wouldn't cover it). Wrangler deploys custom
   domains with `replace_state`, so this also detaches `art.kacperochnik.eu` from the `art-lab`
   Worker.
4. **Keep `art.kacperochnik.eu` in Access while the museum is being built**, so early museum
   deploys stay private. Remove it from the Access application only when the museum is ready to
   open.
5. **Deploy the museum** with its custom domain `art.kacperochnik.eu`.
6. **Old service worker**: browsers that installed the lab as a PWA still have its service worker
   for `art.kacperochnik.eu`, which would keep showing the cached lab. The museum must serve a
   service worker at the same path (`/sw.js`) that replaces it (vite-plugin-pwa's
   `selfDestroying` option for the first release, or the museum's own worker). Reinstall the lab
   PWA from the new address on phones.
7. Update the README, the deploy workflow and the Access docs to the new hostnames.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Live sketches slow the scene | Cap live works at 2–3 and 30 fps; still image elsewhere; stop sketches that miss frames |
| Generated layouts feel samey or maze-like | A small set of hand-tuned room types; wings branch from one atrium; a map |
| Layout shifts when the generator changes | Store `generatorVersion` in the manifest; changing the algorithm is a deliberate "rehang" |
| Effects too heavy for phones | Quality tiers and the GPU benchmark from phase 2 |
| Public sketch code runs in guests' browsers | Same sandbox as the lab, its own origin (#29); only the owner's code is exhibited |
| Multiplayer abuse | Rate limits per connection in the DO, no chat until moderation exists, instance caps |
| Heavy 3D works | Triangle and texture limits checked at exhibit time; GLB compressed (meshopt, KTX2); live 3D only up close; colliders from the size box, not the mesh |
| A 3D sketch sends huge or endless geometry | The host caps buffer sizes and update rate, and drops a live sketch that exceeds them back to its GLB |
