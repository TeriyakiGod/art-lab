/**
 * The API reference: everything a sketch can call. Used by the Reference page,
 * the studio's Lesson panel, and the editor's autocomplete and hover docs.
 */
export interface RefEntry {
  /** Dotted name as written in code, e.g. "lab.noise2D" or "$genart.params.range". */
  name: string;
  /** How a call looks, e.g. "lab.noise2D(x, y)". */
  sig: string;
  /** What comes back, if anything. */
  returns?: string;
  /** One line, shown in autocomplete. */
  summary: string;
  /** Longer markdown explanation. */
  details?: string;
  /** Arguments or options: [name, description]. */
  args?: [string, string][];
  example?: string;
  /** "p5" or "canvas" when it only works in one engine. */
  engine?: "canvas" | "p5";
}

export interface RefSection {
  id: string;
  title: string;
  intro: string;
  entries: RefEntry[];
}

const PARAM_OPTS: [string, string][] = [
  ["name", "Label shown in the Tweak panel."],
  ["desc", "Short help text shown under the label."],
  ["default", "Starting value. Optional: without it the value is picked randomly from the seed."],
];

export const REFERENCE: RefSection[] = [
  {
    id: "skeleton",
    title: "Sketch skeleton",
    intro: "Every sketch starts the same way: wait for the lab, declare params, then draw. The two `await` lines are required, even when you have no params.",
    entries: [
      {
        name: "$genart.waitForAdapter",
        sig: "await $genart.waitForAdapter()",
        summary: "Wait until the lab is ready. Always the first line of a sketch.",
        details: "Nothing else from `$genart` or `lab` is safe to use before this finishes.",
        example: "await $genart.waitForAdapter();",
      },
      {
        name: "$genart.setParams",
        sig: "const param = await $genart.setParams({ id: spec, ... })",
        returns: "a function: `param(id)` gives a param's current value",
        summary: "Declare sliders and other controls for the Tweak panel.",
        details:
          "Each key is a param id you choose; each value is a spec made with one of the `$genart.params.*` functions below. " +
          "Call it once, near the top, even with `{}`. Read values with `param(\"id\")` anywhere after that.\n\n" +
          "`param(\"id\", $genart.random.rnd)` instead returns a *random* value within that param's limits (for example a random number between a range's min and max), without changing the slider.",
        example:
          'const param = await $genart.setParams({\n  count: $genart.params.range({ name: "Count", desc: "How many", min: 1, max: 500, step: 1, default: 100 }),\n});\nconst n = param("count");',
      },
      {
        name: "$genart.setUpdate",
        sig: "$genart.setUpdate((time, frame) => { ...; return true; })",
        summary: "Animate: your function runs every frame.",
        details:
          "`time` is milliseconds since start, `frame` counts frames from 0. Return `true` to keep going, `false` to stop. " +
          "Without it a sketch draws once (a still image). Clear or repaint the background yourself each frame.",
        args: [["time", "Milliseconds since the animation started"], ["frame", "Frame number, from 0"]],
        example:
          '$genart.setUpdate((time) => {\n  ctx.fillStyle = "#000";\n  ctx.fillRect(0, 0, width, height);\n  const x = width / 2 + Math.sin(time * 0.002) * 100;\n  ctx.fillStyle = "#fff";\n  ctx.fillRect(x, height / 2, 20, 20);\n  return true;\n});',
        engine: "canvas",
      },
      {
        name: "$genart.stop",
        sig: "$genart.stop()",
        summary: "Stop the animation loop started by setUpdate.",
      },
    ],
  },
  {
    id: "lab",
    title: "lab: drawing helpers",
    intro: "Small helpers made for this lab. Everything random here follows the seed, so the same seed always gives the same picture.",
    entries: [
      {
        name: "lab.canvas",
        sig: "const { canvas, ctx, width, height } = lab.canvas()",
        returns: "`{ canvas, ctx, width, height }`",
        summary: "Create the drawing canvas and its 2D context.",
        details:
          "Call it once. `width` and `height` are the sketch size in pixels; draw using those numbers. " +
          "The canvas is automatically sharper on high-resolution screens and in 2×/4× exports, so you never deal with pixel density. " +
          "`ctx` is a normal [CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D): see *Canvas 2D essentials* below.",
        example: 'const { ctx, width, height } = lab.canvas();\nctx.fillStyle = "#f1ece2";\nctx.fillRect(0, 0, width, height);',
        engine: "canvas",
      },
      {
        name: "lab.width",
        sig: "lab.width",
        returns: "number",
        summary: "The sketch width in pixels (also works in p5).",
        example: "createCanvas(lab.width, lab.height);",
      },
      {
        name: "lab.height",
        sig: "lab.height",
        returns: "number",
        summary: "The sketch height in pixels (also works in p5).",
      },
      {
        name: "lab.random",
        sig: "lab.random(min = 0, max = 1)",
        returns: "number from `min` up to (not including) `max`",
        summary: "A seeded random number in a range.",
        example: "const r = lab.random(5, 40);   // somewhere between 5 and 40",
      },
      {
        name: "lab.pick",
        sig: "lab.pick(array)",
        returns: "one item of the array",
        summary: "Pick a random item from an array.",
        example: 'ctx.fillStyle = lab.pick(["#e4572e", "#29335c", "#f3a712"]);',
      },
      {
        name: "lab.gaussian",
        sig: "lab.gaussian(mean = 0, sd = 1)",
        returns: "number, usually within `mean ± 2·sd`",
        summary: "A bell-curve random number: mostly near the mean, rarely far away.",
        details: "About 68% of values land within one `sd` of the mean, 95% within two. Good for natural scatter around a point.",
        example: "const x = lab.gaussian(width / 2, 50);",
      },
      {
        name: "lab.map",
        sig: "lab.map(value, inMin, inMax, outMin, outMax)",
        returns: "number",
        summary: "Convert a number from one range to another.",
        details: "`lab.map(5, 0, 10, 100, 200)` is 150. It does not clamp: values outside the input range give values outside the output range.",
        example: "const size = lab.map(y, 0, height, 2, 30);   // bigger lower down",
      },
      {
        name: "lab.noise2D",
        sig: "lab.noise2D(x, y)",
        returns: "number from -1 to 1",
        summary: "Smooth seeded simplex noise: nearby inputs give nearby outputs.",
        details:
          "Scale your coordinates down first: around 1 unit per feature. `lab.noise2D(x / width * 3, y / height * 3)` gives about three bumps across the canvas. " +
          "To get 0–1 instead, use `(lab.noise2D(x, y) + 1) / 2`. See lesson 4.",
        example: "const a = lab.noise2D(x * 0.005, y * 0.005) * Math.PI * 2;   // an angle",
      },
      {
        name: "lab.noise3D",
        sig: "lab.noise3D(x, y, z)",
        returns: "number from -1 to 1",
        summary: "3D noise. Use time as `z` to make a 2D field drift smoothly.",
        example: "const v = lab.noise3D(x * 0.01, y * 0.01, time * 0.0003);",
      },
      {
        name: "lab.palette",
        sig: "lab.palette(fallbackColors?)",
        returns: "array of hex color strings",
        summary: "The colors picked in the Tweak panel's Palette, or your fallback.",
        details:
          "If no palette is picked, returns `fallbackColors` (or a neutral default). By convention the first color is the background and the rest are inks.",
        example: 'const [bg, ...inks] = lab.palette(["#f1ece2", "#1d1b22", "#e4572e"]);',
      },
    ],
  },
  {
    id: "params",
    title: "Params: controls in the Tweak panel",
    intro: "Use these inside `$genart.setParams({ ... })`. Every spec takes `name`, `desc` and `default`; some take more.",
    entries: [
      {
        name: "$genart.params.range",
        sig: '$genart.params.range({ name, desc, min, max, step, default })',
        returns: "a number",
        summary: "A slider for a number.",
        args: [...PARAM_OPTS, ["min", "Lowest value (default 0)."], ["max", "Highest value (default 100)."], ["step", "Slider step (default 1). Use 0.01 for fine values."]],
        example: 'size: $genart.params.range({ name: "Size", desc: "Dot size", min: 1, max: 50, step: 0.5, default: 8 }),',
      },
      {
        name: "$genart.params.color",
        sig: '$genart.params.color({ name, desc, default })',
        returns: 'a hex color string like `"#e4572e"`',
        summary: "A color picker.",
        args: PARAM_OPTS,
        example: 'ink: $genart.params.color({ name: "Ink", desc: "Line color", default: "#1d1b22" }),',
      },
      {
        name: "$genart.params.toggle",
        sig: '$genart.params.toggle({ name, desc, default })',
        returns: "`true` or `false`",
        summary: "An on/off switch.",
        args: PARAM_OPTS,
        example: 'outline: $genart.params.toggle({ name: "Outline", desc: "Draw borders", default: true }),',
      },
      {
        name: "$genart.params.choice",
        sig: '$genart.params.choice({ name, desc, options, default })',
        returns: "the chosen option's value (a string)",
        summary: "Pick one of several named options.",
        args: [...PARAM_OPTS, ["options", 'Array of values, or `[value, label]` pairs: `[["dots", "Dots"], ["lines", "Lines"]]`.']],
        example:
          'shape: $genart.params.choice({ name: "Shape", desc: "What to draw", options: [["circle", "Circles"], ["square", "Squares"]], default: "circle" }),\n// later:\nif (param("shape") === "circle") { ... }',
      },
      {
        name: "$genart.params.xy",
        sig: '$genart.params.xy({ name, desc, default })',
        returns: "`[x, y]`, each from 0 to 1",
        summary: "A 2D position, as two sliders.",
        details: "Multiply by the canvas size to get pixels.",
        args: PARAM_OPTS,
        example: 'center: $genart.params.xy({ name: "Center", desc: "Focus point", default: [0.5, 0.5] }),\n// later:\nconst [cx, cy] = param("center");\nconst px = cx * width, py = cy * height;',
      },
      {
        name: "$genart.params.text",
        sig: '$genart.params.text({ name, desc, default, maxLength })',
        returns: "a string",
        summary: "A text field.",
        args: [...PARAM_OPTS, ["maxLength", "Longest allowed text."]],
        example: 'word: $genart.params.text({ name: "Word", desc: "Text to draw", default: "hello", maxLength: 20 }),',
      },
      {
        name: "$genart.params.weighted",
        sig: '$genart.params.weighted({ name, desc, options })',
        returns: "one option's value",
        summary: "A random choice where some options are more likely (picked from the seed).",
        details: "Options are `[weight, value, label?]`. Leave out `default` to let the seed choose. The Tweak panel can't edit this type yet; it shows the picked value.",
        args: [["name", "Label."], ["desc", "Help text."], ["options", "Array of `[weight, value, label?]`."]],
        example: 'mood: $genart.params.weighted({ name: "Mood", desc: "Rare night mode", options: [[9, "day", "Day"], [1, "night", "Night"]] }),',
      },
    ],
  },
  {
    id: "random",
    title: "Randomness and the seed",
    intro: "Never use `Math.random()`: it ignores the seed, so you could never get the same picture back. Use these (or the `lab` helpers) instead.",
    entries: [
      {
        name: "$genart.random.rnd",
        sig: "$genart.random.rnd()",
        returns: "number from 0 up to (not including) 1",
        summary: "The seeded random function. A drop-in for Math.random().",
        details: "Most sketches start with `const rnd = $genart.random.rnd;` and then call `rnd()`.",
        example: "const rnd = $genart.random.rnd;\nif (rnd() < 0.1) { /* happens 10% of the time */ }",
      },
      {
        name: "$genart.seed",
        sig: "$genart.seed",
        returns: "string",
        summary: "The current seed, as shown in the seed bar.",
      },
      {
        name: "$genart.screen",
        sig: "$genart.screen",
        returns: "`{ width, height, dpr }`",
        summary: "Sketch size and pixel density. `lab.width`/`lab.height` are shortcuts.",
      },
    ],
  },
  {
    id: "math",
    title: "Math helpers",
    intro: "Built into `$genart.math`. Plain JavaScript's `Math` (`Math.sin`, `Math.PI`, `Math.hypot`, …) works too.",
    entries: [
      { name: "$genart.math.clamp", sig: "$genart.math.clamp(x, min, max)", returns: "number", summary: "Keep `x` between `min` and `max`." },
      { name: "$genart.math.clamp01", sig: "$genart.math.clamp01(x)", returns: "number", summary: "Keep `x` between 0 and 1." },
      { name: "$genart.math.mix", sig: "$genart.math.mix(a, b, t)", returns: "number", summary: "Blend from `a` (t = 0) to `b` (t = 1). Also called lerp." },
      { name: "$genart.math.norm", sig: "$genart.math.norm(x, a, b)", returns: "number", summary: "Where `x` sits between `a` and `b`, as 0–1." },
      { name: "$genart.math.fit", sig: "$genart.math.fit(x, a, b, c, d)", returns: "number", summary: "Same as `lab.map`: convert from range a–b to c–d." },
      { name: "$genart.math.smoothstep", sig: "$genart.math.smoothstep(edge0, edge1, x)", returns: "number from 0 to 1", summary: "A smooth S-curve from 0 to 1 as `x` goes from edge0 to edge1." },
      { name: "$genart.math.round", sig: "$genart.math.round(x, step)", returns: "number", summary: "Round to the nearest multiple of `step`, e.g. snap to a grid." },
    ],
  },
  {
    id: "canvas2d",
    title: "Canvas 2D essentials",
    intro:
      "The `ctx` from `lab.canvas()` is the browser's standard drawing API. These are the calls you'll use most; the [full list is on MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D).",
    entries: [
      { name: "ctx.fillStyle", sig: 'ctx.fillStyle = "#e4572e"', summary: "Color for fills, as a string in quotes: `\"#e4572e\"`, `\"rgb(228, 87, 46)\"`, `\"hsl(14, 77%, 54%)\"` or `\"oklch(0.65 0.18 35)\"`.",
        details: "Colors are text, so `rgb(...)` without quotes fails with *rgb is not defined*. To build one from numbers, use a template string: `` ctx.fillStyle = `rgb(${r}, ${g}, ${b})` ``. (In p5, `fill(255, 0, 0)` takes plain numbers instead.)",
        engine: "canvas" },
      { name: "ctx.strokeStyle", sig: 'ctx.strokeStyle = "#1d1b22"', summary: "Color for lines and outlines.", engine: "canvas" },
      { name: "ctx.lineWidth", sig: "ctx.lineWidth = 2", summary: "Line thickness in pixels.", engine: "canvas" },
      { name: "ctx.globalAlpha", sig: "ctx.globalAlpha = 0.5", summary: "Opacity for everything drawn next, 0 (invisible) to 1.", engine: "canvas" },
      { name: "ctx.lineCap", sig: 'ctx.lineCap = "round"', summary: 'Line ends: "butt", "round" or "square".', engine: "canvas" },
      { name: "ctx.fillRect", sig: "ctx.fillRect(x, y, w, h)", summary: "Fill a rectangle. `x, y` is the top-left corner.", engine: "canvas" },
      { name: "ctx.strokeRect", sig: "ctx.strokeRect(x, y, w, h)", summary: "Outline a rectangle.", engine: "canvas" },
      { name: "ctx.clearRect", sig: "ctx.clearRect(x, y, w, h)", summary: "Erase to transparent.", engine: "canvas" },
      {
        name: "ctx.beginPath",
        sig: "ctx.beginPath()",
        summary: "Start a new shape. Then add moveTo/lineTo/arc, then fill() or stroke().",
        example: "ctx.beginPath();\nctx.moveTo(10, 10);\nctx.lineTo(200, 80);\nctx.stroke();",
        engine: "canvas",
      },
      { name: "ctx.moveTo", sig: "ctx.moveTo(x, y)", summary: "Lift the pen and move it to x, y.", engine: "canvas" },
      { name: "ctx.lineTo", sig: "ctx.lineTo(x, y)", summary: "Add a straight line to x, y.", engine: "canvas" },
      {
        name: "ctx.arc",
        sig: "ctx.arc(x, y, radius, startAngle, endAngle)",
        summary: "Add a circle or arc. Angles are radians: a full circle is `0` to `Math.PI * 2`.",
        example: "ctx.beginPath();\nctx.arc(100, 100, 40, 0, Math.PI * 2);\nctx.fill();",
        engine: "canvas",
      },
      { name: "ctx.quadraticCurveTo", sig: "ctx.quadraticCurveTo(cx, cy, x, y)", summary: "Add a curve bending toward the control point cx, cy.", engine: "canvas" },
      { name: "ctx.bezierCurveTo", sig: "ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y)", summary: "Add a curve with two control points.", engine: "canvas" },
      { name: "ctx.closePath", sig: "ctx.closePath()", summary: "Join the end of the shape back to its start.", engine: "canvas" },
      { name: "ctx.fill", sig: "ctx.fill()", summary: "Fill the current shape with fillStyle.", engine: "canvas" },
      { name: "ctx.stroke", sig: "ctx.stroke()", summary: "Draw the current shape's outline with strokeStyle.", engine: "canvas" },
      { name: "ctx.save", sig: "ctx.save()", summary: "Remember the current colors and transform. Pair with restore().", engine: "canvas" },
      { name: "ctx.restore", sig: "ctx.restore()", summary: "Go back to the state from the last save().", engine: "canvas" },
      { name: "ctx.translate", sig: "ctx.translate(x, y)", summary: "Move the origin: later drawing is shifted by x, y.", engine: "canvas" },
      { name: "ctx.rotate", sig: "ctx.rotate(angle)", summary: "Rotate later drawing around the origin (radians).", engine: "canvas" },
      { name: "ctx.scale", sig: "ctx.scale(sx, sy)", summary: "Scale later drawing.", engine: "canvas" },
      {
        name: "ctx.fillText",
        sig: "ctx.fillText(text, x, y)",
        summary: 'Draw text. Set the font first: `ctx.font = "48px serif"`.',
        engine: "canvas",
      },
    ],
  },
  {
    id: "p5",
    title: "p5.js essentials",
    intro:
      "In a p5 sketch (pick **p5** in the studio's engine menu) you write `setup()` and `draw()` like on the p5.js website. `random()` and `noise()` are seeded for you. " +
      "These are the most common calls; the [full p5.js reference](https://p5js.org/reference/) has everything.",
    entries: [
      {
        name: "setup",
        sig: "function setup() { createCanvas(lab.width, lab.height); }",
        summary: "Runs once at the start. Create the canvas here.",
        example: "function setup() {\n  createCanvas(lab.width, lab.height);\n  noLoop();   // a still image\n}",
        engine: "p5",
      },
      { name: "draw", sig: "function draw() { ... }", summary: "Runs every frame (or once, after noLoop()).", engine: "p5" },
      { name: "createCanvas", sig: "createCanvas(lab.width, lab.height)", summary: "Make the drawing canvas. With no size it uses the sketch size.", engine: "p5" },
      { name: "noLoop", sig: "noLoop()", summary: "Draw a single frame: use it for still images.", engine: "p5" },
      { name: "background", sig: "background(color)", summary: "Fill the whole canvas with a color.", engine: "p5" },
      { name: "fill", sig: "fill(color)", summary: "Color for shapes drawn next. `noFill()` turns it off.", engine: "p5" },
      { name: "stroke", sig: "stroke(color)", summary: "Color for lines and outlines. `noStroke()` turns it off.", engine: "p5" },
      { name: "strokeWeight", sig: "strokeWeight(px)", summary: "Line thickness.", engine: "p5" },
      { name: "circle", sig: "circle(x, y, diameter)", summary: "Draw a circle (note: diameter, not radius).", engine: "p5" },
      { name: "ellipse", sig: "ellipse(x, y, w, h)", summary: "Draw an ellipse.", engine: "p5" },
      { name: "rect", sig: "rect(x, y, w, h)", summary: "Draw a rectangle from its top-left corner.", engine: "p5" },
      { name: "line", sig: "line(x1, y1, x2, y2)", summary: "Draw a straight line.", engine: "p5" },
      { name: "beginShape", sig: "beginShape(); vertex(x, y); ... endShape()", summary: "Draw a custom shape from points. `endShape(CLOSE)` closes it.", engine: "p5" },
      { name: "random", sig: "random(min, max) / random(array)", summary: "Seeded random number, or a random item of an array.", engine: "p5" },
      { name: "noise", sig: "noise(x, y?, z?)", summary: "Seeded Perlin noise from 0 to 1 (unlike lab.noise2D's -1 to 1).", engine: "p5" },
      { name: "map", sig: "map(value, inMin, inMax, outMin, outMax)", summary: "Convert a number from one range to another.", engine: "p5" },
      { name: "push", sig: "push() ... pop()", summary: "Save and restore style and transforms around a block of drawing.", engine: "p5" },
      { name: "translate", sig: "translate(x, y)", summary: "Move the origin for later drawing.", engine: "p5" },
      { name: "rotate", sig: "rotate(angle)", summary: "Rotate later drawing (radians by default).", engine: "p5" },
      { name: "frameCount", sig: "frameCount", summary: "How many frames have been drawn; handy for animation.", engine: "p5" },
      { name: "width", sig: "width, height", summary: "The canvas size, after createCanvas().", engine: "p5" },
    ],
  },
];

export const REF_ENTRIES: RefEntry[] = REFERENCE.flatMap((s) => s.entries);

const byName = new Map(REF_ENTRIES.map((e) => [e.name, e]));
export const refEntry = (name: string) => byName.get(name);

const haystack = (e: RefEntry) => `${e.name} ${e.sig} ${e.summary} ${e.details ?? ""}`.toLowerCase();

/** Entries matching every word of the query (the search box). */
export function searchReference(query: string): RefEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return REF_ENTRIES;
  return REF_ENTRIES.filter((e) => terms.every((t) => haystack(e).includes(t)));
}

/** Entries ranked by how many of the query's words they mention (for the assistant's free-text questions). */
export function rankReference(query: string, limit = 6): RefEntry[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  return REF_ENTRIES.map((e) => ({ e, score: terms.filter((t) => haystack(e).includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}

/** Anchor id for an entry, e.g. "ref-lab.noise2D". */
export const refAnchor = (name: string) => `ref-${name.replace(/\$/g, "")}`;
