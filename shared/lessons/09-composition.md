---
title: 9. Composition: curated randomness
summary: Margins, density and empty space, focal points, size contrast, and steering chance so most seeds look good.
---

You now have plenty of ways to make marks. **Composition** is about where they go and how much of the canvas they fill. It's what separates "a random pattern" from "a picture".

## Margins

The easiest upgrade to almost any sketch: leave a border. Edge-to-edge marks feel like wallpaper; a margin turns the same marks into an object on a page.

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  margin: $genart.params.range({ name: "Margin", desc: "Fraction of the canvas", min: 0, max: 0.3, step: 0.01, default: 0.12 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
ctx.fillStyle = "#f1ece2";
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = "#1d1b22";
ctx.lineWidth = 2;

const m = width * param("margin");
const n = 18, s = (width - 2 * m) / n;
for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; x++) {
    const px = m + x * s, py = m + y * s;
    ctx.beginPath();
    if (rnd() < 0.5) { ctx.moveTo(px, py); ctx.lineTo(px + s, py + s); }
    else { ctx.moveTo(px + s, py); ctx.lineTo(px, py + s); }
    ctx.stroke();
  }
}
```

Drag **Margin** from 0 to 0.15. It's the same random maze, but it starts to look framed and intentional.

## Density and empty space

Empty space isn't wasted space. A piece that's dense everywhere has no place for the eye to rest. Let something vary the density: noise, distance from a point, or a simple gradient:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  dots: $genart.params.range({ name: "Dots", desc: "How many to try", min: 1000, max: 20000, step: 500, default: 9000 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
ctx.fillStyle = "#0b0b10";
ctx.fillRect(0, 0, width, height);
ctx.fillStyle = "#f2c14e";

for (let i = 0; i < param("dots"); i++) {
  const x = rnd() * width, y = rnd() * height;
  // Keep a dot more often where the noise is high: dense clouds, calm gaps.
  const keep = (lab.noise2D(x / width * 2.5, y / height * 2.5) + 1) / 2;
  if (rnd() < keep ** 3) {
    ctx.fillRect(x, y, 2, 2);
  }
}
```

Raising `keep` to a power (`** 3`) sharpens the contrast between busy and empty areas, the same trick as lesson 2's distributions.

## A focal point

Pictures read better when there's somewhere to look first. Make one area different: bigger, brighter, denser or a contrasting color. A classic spot is a **third** of the way in from two edges, rather than the dead center:

```js
const fx = width * (rnd() < 0.5 ? 1 / 3 : 2 / 3);
const fy = height * (rnd() < 0.5 ? 1 / 3 : 2 / 3);
const d = Math.hypot(x - fx, y - fy) / width;   // 0 at the focus, bigger further away
const size = lab.map(d, 0, 0.7, 30, 3);          // big near the focus, small far away
```

## Size contrast

Same-sized things look like texture. A few big, many small looks like a scene. You've seen the tool for it (`rnd() ** 3`), and circle packing gets it for free. Watch for it in your own pieces: if everything is the same size, try skewing the sizes.

## Curated randomness

Here's the big idea. Run any sketch through 16 seeds (the **Variations** button in the studio) and some will be great, some dull, a few broken. Generative artists don't just accept that: they **narrow the randomness** until most seeds are good. The usual moves:

1. **Clamp the ranges.** If params outside 0.2–0.6 always look bad, make that the slider range.
2. **Shape the distributions.** Swap uniform `rnd()` for gaussian or powered randomness where extremes look bad.
3. **Reject bad layouts.** Generate, measure, and try again if it fails a check.

The third one looks like this: keep placing a cluster until it isn't too close to the edge or to the previous one:

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const [bg, ...inks] = lab.palette(["#f2efe6", "#2d4a3e", "#6b8f71", "#c9a227", "#8c3b2e"]);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, width, height);

const centers = [];
for (let tries = 0; tries < 500 && centers.length < 5; tries++) {
  const c = { x: rnd() * width, y: rnd() * height, r: lab.random(0.08, 0.2) * width };
  const inside = c.x - c.r > width * 0.08 && c.x + c.r < width * 0.92 && c.y - c.r > height * 0.08 && c.y + c.r < height * 0.92;
  const apart = centers.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > o.r + c.r + 20);
  if (inside && apart) {
    centers.push(c);
  }
}

for (const c of centers) {
  ctx.fillStyle = lab.pick(inks);
  for (let i = 0; i < 400; i++) {
    const a = rnd() * Math.PI * 2, d = Math.abs(lab.gaussian(0, c.r * 0.45));
    ctx.beginPath();
    ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 2 + rnd() ** 4 * 10, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

Every seed now gives five well-spaced clusters inside the margins. The randomness is still there; it just can't make a bad picture any more.

> **Try this:** open this example in the studio, press **Variations**, and look at all 16. Then delete the `inside &&` check and look again.

## Challenge

Take any sketch you made in an earlier lesson and **curate it**: add a margin, give it a focal point, and open **Variations** to find a slider range where at least 12 of 16 seeds look good. Then change the slider's `min` and `max` in the code to that range.
