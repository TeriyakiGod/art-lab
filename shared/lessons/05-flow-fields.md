---
title: 5. Flow fields
summary: Turn a noise field into flowing lines by letting many particles follow it.
---

In lesson 4 you turned noise into a grid of little arrows: at every point, noise picked a direction. A **flow field** is what happens when you stop drawing the arrows and instead drop a **particle** in and let it follow them. Its path becomes a smooth, flowing line.

## From arrows to one path

The recipe is three lines in a loop:

1. Look up the angle at the particle's position: `a = noise(x, y) * 2π`
2. Take a small step in that direction: `x += cos(a) * step`, `y += sin(a) * step`
3. Draw a line from the old position to the new one

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
ctx.fillStyle = "#f1ece2";
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = "#1d1b22";
ctx.lineWidth = 3;

const scale = 3;     // noise zoom, as in lesson 4
const step = 2;      // pixels per step
let x = width * 0.2, y = height * 0.5;

ctx.beginPath();
ctx.moveTo(x, y);
for (let i = 0; i < 400; i++) {
  const a = lab.noise2D((x / width) * scale, (y / height) * scale) * Math.PI * 2;
  x += Math.cos(a) * step;
  y += Math.sin(a) * step;
  ctx.lineTo(x, y);
}
ctx.stroke();
```

Press **New seed** a few times. Every seed is a different field, so the path winds differently.

## Many particles

One line is a curiosity. A thousand lines that all obey the same field start to show its shape, like iron filings around a magnet. Use a low opacity so overlapping paths build up density:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  count: $genart.params.range({ name: "Particles", desc: "How many paths", min: 50, max: 3000, step: 50, default: 1200 }),
  length: $genart.params.range({ name: "Length", desc: "Steps per path", min: 10, max: 300, step: 10, default: 80 }),
  scale: $genart.params.range({ name: "Scale", desc: "Noise zoom", min: 0.5, max: 10, step: 0.5, default: 2.5 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
ctx.fillStyle = "#0b0b10";
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = "#9ad1ff";
ctx.globalAlpha = 0.25;
ctx.lineWidth = 1;

for (let p = 0; p < param("count"); p++) {
  let x = rnd() * width, y = rnd() * height;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < param("length"); i++) {
    const a = lab.noise2D((x / width) * param("scale"), (y / height) * param("scale")) * Math.PI * 2;
    x += Math.cos(a) * 2;
    y += Math.sin(a) * 2;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}
```

> **Try this:** drag **Length** down to 10 and up to 300. Short paths look like fur or grass; long ones look like hair or smoke.

## Shaping the field

The field doesn't have to be raw noise. Anything that gives an angle for a point works, and mixing noise with a *plan* is where flow fields get interesting:

| Change | Effect |
|---|---|
| `a = noise * Math.PI` (instead of `2π`) | Paths stop curling back; everything drifts one way |
| `a += Math.PI / 4` | Rotates the whole field |
| `a = Math.atan2(cy - y, cx - x) + noise` | Paths swirl around a center point |
| Round `a` to steps of `Math.PI / 4` | Angular, circuit-board lines |

Here the angle points around the center, with noise added so it doesn't look mechanical:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  swirl: $genart.params.range({ name: "Swirl", desc: "0 = pure noise, 1 = pure circle", min: 0, max: 1, step: 0.05, default: 0.7 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const [bg, ...inks] = lab.palette(["#f1ece2", "#1d1b22", "#e4572e", "#29335c"]);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, width, height);
ctx.globalAlpha = 0.5;
ctx.lineWidth = 1.5;

const cx = width / 2, cy = height / 2;
for (let p = 0; p < 900; p++) {
  let x = rnd() * width, y = rnd() * height;
  ctx.strokeStyle = lab.pick(inks);
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < 60; i++) {
    const around = Math.atan2(cy - y, cx - x) + Math.PI / 2;      // tangent to a circle
    const wander = lab.noise2D(x / width * 3, y / height * 3) * Math.PI * 2;
    const a = around * param("swirl") + wander * (1 - param("swirl"));
    x += Math.cos(a) * 2.5;
    y += Math.sin(a) * 2.5;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}
```

Pick a palette in the studio's **Tweak** panel after opening this one: the colors come from `lab.palette()`.

## Where to start particles

Starting points shape the picture as much as the field does:

- **Random** everywhere (above): even, textured coverage
- **Along one edge** (`x = 0`, random `y`): everything streams across like wind
- **On a grid**: tidy and regular, good for plotter drawings
- **In a circle**: a burst that the field then bends

> **Try this:** in the "many particles" example, change the start to `let x = 0, y = rnd() * height;` and raise **Length** to 300.

## Challenge

Make a flow field where particles start **in a small circle in the middle** of the canvas and flow outward, with each particle's color picked from `lab.palette()`. Hint: start each particle at `cx + Math.cos(t) * r, cy + Math.sin(t) * r` with `t = rnd() * Math.PI * 2` and a small `r`.
