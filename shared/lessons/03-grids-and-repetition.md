---
title: 3. Grids and repetition
summary: Nested loops, cell coordinates, and how small per-cell decisions build big patterns (Truchet tiles, subdivision).
---

Grids are the workhorse of generative art. Split the canvas into cells, make a small decision in each one, and patterns emerge that are much bigger than any single decision.

## A loop inside a loop

One loop gives you a row. A loop **inside** a loop gives you rows *and* columns:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  cells: $genart.params.range({ name: "Cells", desc: "Cells per row", min: 2, max: 40, step: 1, default: 10 }),
});

const { ctx, width, height } = lab.canvas();
const n = param("cells");
const size = width / n;           // size of one cell

ctx.fillStyle = "#f1ece2";
ctx.fillRect(0, 0, width, height);
ctx.fillStyle = "#1d1b22";

for (let row = 0; row < n; row++) {
  for (let col = 0; col < n; col++) {
    const x = col * size;         // left edge of this cell
    const y = row * size;         // top edge of this cell
    const r = size * 0.35;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

The key idea is that `col * size` and `row * size` turn a cell's **index** into a **position**.

## Normalized coordinates: u and v

It's handy to know *where* a cell is as a number from 0 to 1: `u = col / (n - 1)` goes from 0 on the left edge to 1 on the right. Then you can make things **change across the grid**, like size, color or rotation:

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const n = 16, size = width / n;
ctx.fillStyle = "#0b0b10";
ctx.fillRect(0, 0, width, height);

for (let row = 0; row < n; row++) {
  for (let col = 0; col < n; col++) {
    const u = col / (n - 1), v = row / (n - 1);
    ctx.save();
    ctx.translate((col + 0.5) * size, (row + 0.5) * size);  // move to the cell center
    ctx.rotate(u * Math.PI);                                // rotate more to the right
    ctx.fillStyle = `hsl(${200 + v * 140}, 70%, 60%)`;      // hue shifts downward
    const s = size * (0.2 + 0.6 * v);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
}
```

`ctx.save()`, `translate`, `rotate` and `ctx.restore()` let you draw each shape around `(0, 0)` and then put it in place. That's much easier than calculating rotated corners yourself.

## Truchet tiles: one coin flip per cell

Here's a classic. Each cell holds one of two tiles with quarter-circle arcs, chosen at random. The arcs line up across cell borders and form winding paths:

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const n = 12, s = width / n;
ctx.fillStyle = "#0f3d3e";
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = "#f2c14e";
ctx.lineWidth = s * 0.18;

const arc = (x, y, start) => {
  ctx.beginPath();
  ctx.arc(x, y, s / 2, start, start + Math.PI / 2);
  ctx.stroke();
};

for (let row = 0; row < n; row++) {
  for (let col = 0; col < n; col++) {
    const x = col * s, y = row * s;
    if (rnd() < 0.5) { arc(x, y, 0); arc(x + s, y + s, Math.PI); }
    else { arc(x + s, y, Math.PI / 2); arc(x, y + s, -Math.PI / 2); }
  }
}
```

Change the seed and you get a completely different maze from the same two tiles.

## Breaking the grid: subdivision

Perfect grids can feel rigid. **Recursive subdivision** starts with one big square, splits it into four, and then decides randomly whether to split each piece again:

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const colors = ["#e4572e", "#29335c", "#f3a712", "#f1ece2", "#1d1b22"];
ctx.fillStyle = "#f1ece2";
ctx.fillRect(0, 0, width, height);

function split(x, y, size, depth) {
  if (depth < 5 && (depth < 1 || rnd() < 0.6)) {
    const h = size / 2;
    split(x, y, h, depth + 1);
    split(x + h, y, h, depth + 1);
    split(x, y + h, h, depth + 1);
    split(x + h, y + h, h, depth + 1);
  } else {
    ctx.fillStyle = lab.pick(colors);
    ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
  }
}
split(0, 0, width, 0);
```

A function that **calls itself** is called *recursive*. The `depth` counter stops it from going forever.

> **Try this:** change `0.6` to `0.3` or `0.85`. In the Truchet example, try a bias other than `0.5`.

## Challenge

Make a grid where each cell contains a **line from one corner to the opposite corner**, choosing randomly between `\` and `/`. This is the famous "10 PRINT" pattern. Then add a parameter for line thickness.
