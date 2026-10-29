---
title: 6. Packing and placement
summary: Why plain random placement clumps, and how dart throwing, jittered grids and circle packing spread things out.
---

Where you put things matters as much as what you draw. Plain `rnd() * width` placement has a surprising problem: it **clumps**. Some spots get crowded, others stay empty, and the eye notices.

## Random clumps

Both halves below have 300 dots. On the left they're placed with plain randomness. On the right, a dot is only kept if it isn't too close to an existing one:

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
ctx.fillStyle = "#f1ece2";
ctx.fillRect(0, 0, width, height);
ctx.fillStyle = "#1d1b22";
const half = width / 2, r = 4;

// Left: plain random
for (let i = 0; i < 300; i++) {
  ctx.beginPath();
  ctx.arc(rnd() * (half - 20) + 10, rnd() * (height - 20) + 10, r, 0, Math.PI * 2);
  ctx.fill();
}

// Right: reject dots that land too close to one we kept
const kept = [];
for (let tries = 0; tries < 20000 && kept.length < 300; tries++) {
  const x = half + 10 + rnd() * (half - 20), y = 10 + rnd() * (height - 20);
  if (kept.every((p) => Math.hypot(p.x - x, p.y - y) > 14)) {
    kept.push({ x, y });
  }
}
for (const p of kept) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}
```

The right side looks "random but even". That evenness is called **blue noise**, and it's how seeds in a sunflower, cells in skin and stars in a good starfield tend to look.

## Dart throwing

The trick on the right is the simplest placement algorithm there is, sometimes called **dart throwing** or rejection sampling:

1. Pick a random point
2. If it's closer than `minDist` to any point you already kept, throw it away
3. Repeat until you have enough points, or you've tried too many times

Always cap the number of tries: once the canvas is full, no new point will ever fit, and an uncapped loop would run forever (the studio would stop it after 5 seconds).

> **Try this:** change `14` to `30` and `300` to `1000`. The loop gives up when there's no room left, so you get as many dots as fit.

## Jittered grid: the cheap version

If you just need things spread out, start from a grid and nudge each point a little. It's instant, never fails, and still looks organic:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  cells: $genart.params.range({ name: "Cells", desc: "Per row", min: 4, max: 40, step: 1, default: 14 }),
  jitter: $genart.params.range({ name: "Jitter", desc: "How far points wander from the grid", min: 0, max: 1, step: 0.05, default: 0.4 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const [bg, ...inks] = lab.palette(["#1b1026", "#ff9f43", "#ee5253", "#f8efe0"]);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, width, height);

const n = param("cells"), s = width / n;
for (let gy = 0; gy < n; gy++) {
  for (let gx = 0; gx < n; gx++) {
    const x = (gx + 0.5 + (rnd() - 0.5) * param("jitter")) * s;
    const y = (gy + 0.5 + (rnd() - 0.5) * param("jitter")) * s;
    ctx.fillStyle = lab.pick(inks);
    ctx.beginPath();
    ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

At **Jitter** 0 it's a rigid grid; at 1 it starts to clump again. Somewhere around 0.3–0.5 is usually the sweet spot.

## Circle packing

Circle packing goes one step further: circles of **different sizes** that never overlap. The idea is dart throwing with a radius:

1. Pick a random point
2. Find the distance to the nearest edge of every existing circle
3. If there's room, place the **biggest circle that fits** there (up to a maximum)

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  attempts: $genart.params.range({ name: "Attempts", desc: "Placement tries", min: 500, max: 20000, step: 500, default: 6000 }),
  maxR: $genart.params.range({ name: "Largest", desc: "Largest radius", min: 10, max: 150, step: 5, default: 70 }),
  gap: $genart.params.range({ name: "Gap", desc: "Space between circles", min: 0, max: 10, step: 0.5, default: 2 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const [bg, ...inks] = lab.palette(["#06222e", "#c8f7f4", "#1dd1a1", "#10ac84", "#48dbfb"]);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, width, height);

const circles = [];
for (let i = 0; i < param("attempts"); i++) {
  const x = rnd() * width, y = rnd() * height;
  let r = Math.min(param("maxR"), x, y, width - x, height - y);  // stay inside the canvas
  for (const c of circles) {
    r = Math.min(r, Math.hypot(c.x - x, c.y - y) - c.r - param("gap"));
    if (r < 2) break;
  }
  if (r >= 2) {
    circles.push({ x, y, r });
    ctx.fillStyle = lab.pick(inks);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

Early attempts find lots of room and make big circles; later ones only find gaps, so the sizes naturally go from big to tiny. Nothing in the code asks for that, it just falls out of the rule. That's the kind of thing generative art is good at.

## Making it fast

Checking every new point against every circle gets slow once there are thousands. The standard fix is a **spatial grid**: chop the canvas into cells and only check circles in nearby cells. You don't need it yet, but it's worth knowing the name when a sketch starts to crawl.

## Challenge

Draw a **starfield using dart throwing**: about 400 stars that never sit too close together, where most are tiny and a few are big and bright. Hint: keep the rejection rule from the first example, and pick each star's size with `rnd() ** 4` (lesson 2's trick for "mostly small, a few big").
