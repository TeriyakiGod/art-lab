export interface Template {
  id: string;
  title: string;
  description: string;
  code: string;
}

const blank = `await $genart.waitForAdapter();

const param = await $genart.setParams({
  bg: $genart.params.color({ name: "Background", desc: "Paper color", default: "#15151a" }),
  ink: $genart.params.color({ name: "Ink", desc: "Drawing color", default: "#f4efe6" }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;

ctx.fillStyle = param("bg");
ctx.fillRect(0, 0, width, height);

ctx.fillStyle = param("ink");
ctx.beginPath();
ctx.arc(width / 2, height / 2, width * 0.2, 0, Math.PI * 2);
ctx.fill();
`;

const noiseGrid = `// A grid of short strokes whose angle comes from simplex noise.
await $genart.waitForAdapter();

const param = await $genart.setParams({
  cells: $genart.params.range({ name: "Cells", desc: "Cells per row", min: 8, max: 120, step: 1, default: 48 }),
  scale: $genart.params.range({ name: "Noise scale", desc: "Zoom of the noise field", min: 0.5, max: 12, step: 0.1, default: 3 }),
  length: $genart.params.range({ name: "Stroke length", desc: "Relative to cell size", min: 0.2, max: 3, step: 0.05, default: 1.2 }),
  bg: $genart.params.color({ name: "Background", desc: "Paper color", default: "#f1ece2" }),
  ink: $genart.params.color({ name: "Ink", desc: "Stroke color", default: "#1d1b22" }),
});

const { ctx, width, height } = lab.canvas();
const n = param("cells");
const cell = width / n;

ctx.fillStyle = param("bg");
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = param("ink");
ctx.lineCap = "round";
ctx.lineWidth = Math.max(1, cell * 0.12);

for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    const angle = lab.noise2D(u * param("scale"), v * param("scale")) * Math.PI * 2;
    const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell;
    const r = cell * param("length") * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * r, cy - Math.sin(angle) * r);
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.stroke();
  }
}
`;

const truchet = `// Truchet tiles: each cell gets one of two quarter-circle tiles at random.
await $genart.waitForAdapter();

const param = await $genart.setParams({
  cells: $genart.params.range({ name: "Cells", desc: "Tiles per row", min: 2, max: 40, step: 1, default: 12 }),
  weight: $genart.params.range({ name: "Line weight", desc: "Relative to tile size", min: 0.02, max: 0.5, step: 0.01, default: 0.18 }),
  bias: $genart.params.range({ name: "Bias", desc: "Chance of the first tile", min: 0, max: 1, step: 0.01, default: 0.5 }),
  bg: $genart.params.color({ name: "Background", desc: "Paper color", default: "#0f3d3e" }),
  ink: $genart.params.color({ name: "Ink", desc: "Line color", default: "#f2c14e" }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const n = param("cells");
const s = width / n;

ctx.fillStyle = param("bg");
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = param("ink");
ctx.lineWidth = s * param("weight");
ctx.lineCap = "round";

const arc = (x, y, a0) => {
  ctx.beginPath();
  ctx.arc(x, y, s / 2, a0, a0 + Math.PI / 2);
  ctx.stroke();
};

for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; x++) {
    const px = x * s, py = y * s;
    if (rnd() < param("bias")) {
      arc(px, py, 0);
      arc(px + s, py + s, Math.PI);
    } else {
      arc(px + s, py, Math.PI / 2);
      arc(px, py + s, -Math.PI / 2);
    }
  }
}
`;

const flowField = `// Particles follow a noise-based flow field, leaving thin trails.
await $genart.waitForAdapter();

const param = await $genart.setParams({
  particles: $genart.params.range({ name: "Particles", desc: "Number of trails", min: 100, max: 6000, step: 100, default: 1800 }),
  steps: $genart.params.range({ name: "Steps", desc: "Trail length", min: 10, max: 400, step: 10, default: 120 }),
  scale: $genart.params.range({ name: "Noise scale", desc: "Zoom of the field", min: 0.3, max: 8, step: 0.1, default: 1.6 }),
  curl: $genart.params.range({ name: "Curl", desc: "How much the field turns", min: 0.5, max: 6, step: 0.1, default: 2.5 }),
  alpha: $genart.params.range({ name: "Opacity", desc: "Trail opacity", min: 0.02, max: 1, step: 0.01, default: 0.18 }),
  bg: $genart.params.color({ name: "Background", desc: "Paper color", default: "#0b0b10" }),
  ink: $genart.params.color({ name: "Ink", desc: "Trail color", default: "#9ad1ff" }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;

ctx.fillStyle = param("bg");
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = param("ink");
ctx.globalAlpha = param("alpha");
ctx.lineWidth = 1;

const angleAt = (x, y) =>
  lab.noise2D((x / width) * param("scale"), (y / height) * param("scale")) * Math.PI * param("curl");

for (let p = 0; p < param("particles"); p++) {
  let x = rnd() * width, y = rnd() * height;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < param("steps"); i++) {
    const a = angleAt(x, y);
    x += Math.cos(a) * 2;
    y += Math.sin(a) * 2;
    if (x < 0 || x > width || y < 0 || y > height) break;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}
`;

const circlePacking = `// Circle packing: try random spots, keep circles that don't overlap.
await $genart.waitForAdapter();

const param = await $genart.setParams({
  attempts: $genart.params.range({ name: "Attempts", desc: "How many placements to try", min: 500, max: 30000, step: 500, default: 8000 }),
  minR: $genart.params.range({ name: "Min radius", desc: "Smallest circle", min: 1, max: 30, step: 1, default: 3 }),
  maxR: $genart.params.range({ name: "Max radius", desc: "Largest circle", min: 10, max: 250, step: 5, default: 90 }),
  gap: $genart.params.range({ name: "Gap", desc: "Space between circles", min: 0, max: 20, step: 0.5, default: 3 }),
  fill: $genart.params.toggle({ name: "Filled", desc: "Fill circles instead of outlining", default: true }),
  palette: $genart.params.choice({
    name: "Palette", desc: "Color scheme",
    options: [["sunset", "Sunset"], ["sea", "Sea"], ["mono", "Mono"]], default: "sunset",
  }),
});

const palettes = {
  sunset: { bg: "#1b1026", colors: ["#ff6b6b", "#feca57", "#ff9f43", "#ee5253", "#f8efe0"] },
  sea: { bg: "#06222e", colors: ["#48dbfb", "#0abde3", "#c8f7f4", "#1dd1a1", "#10ac84"] },
  mono: { bg: "#f4f1ea", colors: ["#111111", "#333333", "#777777"] },
};

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const pal = palettes[param("palette")];
const circles = [];

ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, width, height);

for (let i = 0; i < param("attempts"); i++) {
  const x = rnd() * width, y = rnd() * height;
  // Largest radius that fits here
  let r = param("maxR");
  for (const c of circles) {
    const d = Math.hypot(c.x - x, c.y - y) - c.r - param("gap");
    if (d < r) r = d;
    if (r < param("minR")) break;
  }
  if (r < param("minR")) continue;
  circles.push({ x, y, r });
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (param("fill")) {
    ctx.fillStyle = lab.pick(pal.colors);
    ctx.fill();
  } else {
    ctx.strokeStyle = lab.pick(pal.colors);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
`;

const paletteBlocks = `// Recursive subdivision: split the canvas into blocks and fill them from the palette.
// Pick a palette in the Tweak panel to recolor it.
await $genart.waitForAdapter();

const param = await $genart.setParams({
  depth: $genart.params.range({ name: "Depth", desc: "How many times blocks can split", min: 1, max: 9, step: 1, default: 6 }),
  stop: $genart.params.range({ name: "Stop chance", desc: "Chance a block stops splitting early", min: 0, max: 0.6, step: 0.01, default: 0.2 }),
  gap: $genart.params.range({ name: "Gap", desc: "Space between blocks", min: 0, max: 20, step: 1, default: 6 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const [bg, ...colors] = lab.palette();

ctx.fillStyle = bg;
ctx.fillRect(0, 0, width, height);

function block(x, y, w, h, depth) {
  if (depth === 0 || (depth < param("depth") && rnd() < param("stop"))) {
    const g = param("gap") / 2;
    ctx.fillStyle = lab.pick(colors.length ? colors : [bg]);
    ctx.fillRect(x + g, y + g, w - 2 * g, h - 2 * g);
    return;
  }
  const t = lab.random(0.3, 0.7);
  if (w > h) {
    block(x, y, w * t, h, depth - 1);
    block(x + w * t, y, w * (1 - t), h, depth - 1);
  } else {
    block(x, y, w, h * t, depth - 1);
    block(x, y + h * t, w, h * (1 - t), depth - 1);
  }
}

block(0, 0, width, height, param("depth"));
`;

export const TEMPLATES: Template[] = [
  { id: "blank", title: "Blank", description: "A canvas, two colors and a circle.", code: blank },
  { id: "noise-grid", title: "Noise grid", description: "Strokes rotated by simplex noise.", code: noiseGrid },
  { id: "truchet", title: "Truchet tiles", description: "Random quarter-circle tiles that connect.", code: truchet },
  { id: "flow-field", title: "Flow field", description: "Particle trails following a noise field.", code: flowField },
  { id: "circle-packing", title: "Circle packing", description: "Non-overlapping circles of many sizes.", code: circlePacking },
  { id: "palette-blocks", title: "Palette blocks", description: "Recursive blocks colored from your palette.", code: paletteBlocks },
];
