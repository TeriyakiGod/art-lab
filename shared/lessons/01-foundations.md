---
title: 1. Foundations: drawing with code
summary: The canvas, coordinates, shapes and colors, and the small amount of setup every sketch needs.
---

Algorithmic art means **writing rules that make pictures** instead of drawing every mark by hand. You describe *how* to draw, the computer does the drawing, and often the result surprises you. That surprise is the fun part.

## The canvas and its coordinates

Every sketch draws onto a **canvas**, a grid of pixels. Positions are given as `(x, y)`:

- `x` grows to the **right**, starting at `0` on the left edge
- `y` grows **downward**, starting at `0` at the top. This trips everyone up at first!
- In this lab a canvas is `width × height` units (1000 × 1000 by default)

So the center is `(width / 2, height / 2)` and the bottom-right corner is `(width, height)`.

## Your first sketch

Run it, then click **Edit code** and change some numbers.

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();

// Paint the background
ctx.fillStyle = "#15151a";
ctx.fillRect(0, 0, width, height);

// A filled circle in the middle
ctx.fillStyle = "#f2c14e";
ctx.beginPath();
ctx.arc(width / 2, height / 2, 200, 0, Math.PI * 2);
ctx.fill();

// A square outline in the top-left area
ctx.strokeStyle = "#9ad1ff";
ctx.lineWidth = 12;
ctx.strokeRect(100, 100, 250, 250);
```

What's going on:

- The first two lines are **setup**. They tell the lab the sketch is ready and which parameters it has (none yet). You'll find them at the top of every sketch.
- `lab.canvas()` makes the canvas and gives you `ctx`, the **drawing context**. Every drawing command goes through `ctx`.
- `fillStyle` and `strokeStyle` choose the colors. `fillRect` and `strokeRect` draw rectangles.
- A circle is a path: `beginPath()`, then `arc(x, y, radius, startAngle, endAngle)`, then `fill()` or `stroke()`. Angles are in **radians**, and a full turn is `Math.PI * 2`.

> **Try this:** move the circle to the bottom-right corner. Make the square's line thinner. Change the colors using hex codes like `"#ff6b6b"`.

## Repetition is the superpower

Drawing one circle is nothing special. The power of code is that **drawing a thousand is just as easy**. A `for` loop repeats a block of code:

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
ctx.fillStyle = "#0f3d3e";
ctx.fillRect(0, 0, width, height);

ctx.strokeStyle = "#f2c14e";
ctx.lineWidth = 3;

for (let i = 0; i < 20; i++) {
  // i goes 0, 1, 2, … 19
  const radius = 20 + i * 22;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  ctx.stroke();
}
```

The variable `i` counts up each time around the loop, and we use it to **calculate** something (here, the radius). Almost every generative piece is built this way: a loop, plus a formula that turns the counter into position, size or color.

> **Try this:** change `width / 2` to `width / 2 + i * 10` and see the rings slide. Then try `ctx.lineWidth = i;` inside the loop.

## Parameters: knobs you can turn

Hard-coded numbers are fine, but it's much more fun when you can **tweak them live**. Declare them with `$genart.setParams`, then read them with `param("name")`. They show up as sliders and pickers in the **Tweak** panel of the studio.

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  rings: $genart.params.range({ name: "Rings", desc: "How many rings", min: 1, max: 60, step: 1, default: 20 }),
  ink: $genart.params.color({ name: "Ink", desc: "Ring color", default: "#f2c14e" }),
});

const { ctx, width, height } = lab.canvas();
ctx.fillStyle = "#0f3d3e";
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = param("ink");
ctx.lineWidth = 3;

const step = (width * 0.45) / param("rings");
for (let i = 1; i <= param("rings"); i++) {
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, i * step, 0, Math.PI * 2);
  ctx.stroke();
}
```

Open this example in the studio (**Open in studio ↗**) and drag the *Rings* slider.

## Challenge

Make a sketch with **a row of squares across the middle** that get bigger from left to right. Add a parameter for how many squares there are.

*Stuck?* Open the studio's Assistant and ask: "Give me a hint for the lesson 1 challenge, but don't solve it."
