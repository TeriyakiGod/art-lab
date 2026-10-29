---
title: 4. Noise: smooth randomness
summary: Simplex noise, noise scale, layering octaves, and animating with a third dimension.
---

Pure randomness jumps around: neighboring values have nothing to do with each other. Nature doesn't work like that. Hills, clouds and wood grain change **smoothly**. **Noise** is randomness that changes smoothly.

## Random vs. noise

Here's the same row of bars twice. On top, every height is a fresh `rnd()`. Below, each height comes from `lab.noise2D(x, 0)`:

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
ctx.fillStyle = "#0b0b10";
ctx.fillRect(0, 0, width, height);

const bars = 120, w = width / bars;
for (let i = 0; i < bars; i++) {
  const r = rnd();                                 // 0 … 1, jumpy
  const n = (lab.noise2D(i * 0.05, 0) + 1) / 2;    // -1 … 1 mapped to 0 … 1, smooth
  ctx.fillStyle = "#e4572e";
  ctx.fillRect(i * w, height * 0.45 - r * 400, w - 1, r * 400);
  ctx.fillStyle = "#9ad1ff";
  ctx.fillRect(i * w, height * 0.95 - n * 400, w - 1, n * 400);
}
```

`lab.noise2D(x, y)` returns a value between **-1 and 1**. Nearby inputs give nearby outputs. Like everything here, it depends on the seed.

## Noise scale: how zoomed in you are

The number you multiply your coordinates by is the **scale**, and it's the most important knob:

- **Small scale** (e.g. `0.001 × pixel`): you're zoomed in, so changes are slow and gentle
- **Large scale** (e.g. `0.05 × pixel`): you're zoomed out, so changes are busy and wiggly

A common trick is to use normalized coordinates (`x / width`) times a scale of around 1–10:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  scale: $genart.params.range({ name: "Scale", desc: "Noise zoom", min: 0.5, max: 20, step: 0.5, default: 4 }),
});

const { ctx, width, height } = lab.canvas();
const cells = 100, s = width / cells;

for (let y = 0; y < cells; y++) {
  for (let x = 0; x < cells; x++) {
    const n = lab.noise2D((x / cells) * param("scale"), (y / cells) * param("scale"));
    const light = 50 + n * 40;                 // -1 … 1  →  10% … 90%
    ctx.fillStyle = `hsl(210, 60%, ${light}%)`;
    ctx.fillRect(x * s, y * s, s + 1, s + 1);
  }
}
```

## Noise as direction

Noise doesn't have to be brightness. Turn it into an **angle** and you get a field of directions. That's the core of *flow fields* (lesson 5):

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
ctx.fillStyle = "#f1ece2";
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = "#1d1b22";
ctx.lineWidth = 3;
ctx.lineCap = "round";

const n = 40, s = width / n;
for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; x++) {
    const a = lab.noise2D(x / n * 3, y / n * 3) * Math.PI * 2;
    const cx = (x + 0.5) * s, cy = (y + 0.5) * s;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * s * 0.8, cy + Math.sin(a) * s * 0.8);
    ctx.stroke();
  }
}
```

## Octaves: layering detail

Real landscapes have big hills *and* small bumps. You get that by **adding several noise layers**, each one twice as detailed and half as strong. This is called *fractal noise* or *fBm*:

```js
function fbm(x, y, octaves = 5) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * lab.noise2D(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;   // each layer is half as strong…
    freq *= 2;    // …and twice as detailed
  }
  return sum / norm;
}
```

> **Try this:** paste `fbm` into the "noise scale" example and use it instead of `lab.noise2D`. The result looks like clouds or terrain.

## Animation with a third dimension

`lab.noise3D(x, y, z)` adds another input. If you feed **time** into `z`, the whole field drifts smoothly. `$genart.setUpdate` calls your function every frame:

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const n = 30, s = width / n;

$genart.setUpdate((time) => {
  const t = time * 0.0003;
  ctx.fillStyle = "#0b0b10";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f2c14e";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = (lab.noise3D(x / n * 3, y / n * 3, t) + 1) / 2;
      const r = v * s * 0.5;
      ctx.beginPath();
      ctx.arc((x + 0.5) * s, (y + 0.5) * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return true; // keep animating
});
```

## Challenge

Draw **20 horizontal lines** across the canvas, each one wobbling up and down using noise, like a landscape seen from the side or a heart-rate monitor. Hint: for each line, step `x` across the width and set `y = baseY + lab.noise2D(x * 0.005, lineIndex) * 60`.
