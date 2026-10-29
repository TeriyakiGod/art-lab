---
title: 2. Randomness and seeds
summary: Controlled chance, why every piece has a seed, and how to shape randomness with distributions.
---

Randomness is how a sketch becomes a **system that makes many pictures** instead of a single picture. But we want *controlled* randomness: chance we can steer, repeat, and come back to.

## Random numbers

`$genart.random.rnd()` returns a number between `0` (included) and `1` (not included). Multiply and add to get any range you want:

| You want | Write |
|---|---|
| 0 … 1 | `rnd()` |
| 0 … width | `rnd() * width` |
| 50 … 150 | `50 + rnd() * 100`, or `lab.random(50, 150)` |
| a random item | `lab.pick(["red", "gold", "teal"])` |
| true 30% of the time | `rnd() < 0.3` |

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;

ctx.fillStyle = "#f1ece2";
ctx.fillRect(0, 0, width, height);

for (let i = 0; i < 400; i++) {
  const x = rnd() * width;
  const y = rnd() * height;
  const r = lab.random(4, 40);
  ctx.fillStyle = lab.pick(["#1d1b22", "#e4572e", "#29335c", "#f3a712"]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
```

Press **New seed** a few times. Same code, different picture each time.

## What is a seed?

Computers can't really be random. They use a **pseudo-random number generator**: a formula that produces a sequence of numbers that *looks* random. The **seed** is where that sequence starts.

- **Same seed, same numbers, same picture.** Every time, on every device.
- Different seed, different picture.

That's why the studio shows the seed under the canvas. When you find a result you love, the seed is its address. Press **★ Save** and you can always get back to it, or re-render it at 4× for a print.

> ⚠️ **Never use `Math.random()`** in a sketch. It ignores the seed, so your favorite result can never be reproduced. Always use `$genart.random.rnd` or the `lab.*` helpers.

## Shaping randomness: distributions

"Uniform" randomness (`rnd()`) makes every value equally likely. That often looks flat and noisy. Real art usually needs **shaped** randomness.

**Gaussian (bell curve):** most values land near the middle and a few stray far out. `lab.gaussian(mean, spread)` gives you this. It's great for clusters and natural-looking variation.

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
ctx.fillStyle = "#0b0b10";
ctx.fillRect(0, 0, width, height);
ctx.fillStyle = "#9ad1ff";
ctx.globalAlpha = 0.5;

// Left half: uniform. Right half: gaussian around the center line.
for (let i = 0; i < 3000; i++) {
  const y = rnd() * height;
  ctx.fillRect(rnd() * width * 0.48, y, 3, 3);
  ctx.fillRect(lab.gaussian(width * 0.75, 50), y, 3, 3);
}
```

**Powers:** `rnd() ** 3` pushes values toward 0, so you get mostly small numbers and a few big ones. Use it for sizes, and you get many small circles and a few large ones, which tends to look good.

**Weighted choices:** to make some options rarer than others, compare `rnd()` against thresholds:

```js
const r = rnd();
const color = r < 0.7 ? "black" : r < 0.95 ? "red" : "gold"; // 70% / 25% / 5%
```

> **Try this:** in the first example, change the radius to `4 + rnd() ** 3 * 80`. Notice how the composition gets more interesting with a few big "hero" circles.

## Challenge

Make a "starfield": hundreds of tiny white dots, where **most are faint and small** and a rare few are **big and bright**. Hint: use `rnd() ** 4` for size, and set `ctx.globalAlpha` from the same number.
