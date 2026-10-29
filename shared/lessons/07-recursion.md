---
title: 7. Recursion: fractal trees and L-systems
summary: Functions that call themselves, base cases, subdivision, branching trees and a tiny L-system.
---

A **recursive** function is one that calls itself. It sounds like a trick, but it's the natural way to describe shapes that contain smaller copies of themselves: a branch that splits into smaller branches, a square split into smaller squares, a coastline made of smaller coastlines.

## Two rules: do a bit, then recurse

Every recursive drawing has the same skeleton:

```js
function draw(shape, depth) {
  if (depth === 0) return;          // base case: stop
  // ...draw something...
  draw(smallerShape, depth - 1);    // recursive case: same thing, smaller
}
```

The **base case** is the important part. Without it the function calls itself forever, the browser runs out of room ("Maximum call stack size exceeded") and the sketch stops with an error. Counting down a `depth` is the simplest way to guarantee it stops.

## Subdivision

Split a square into four, then maybe split each of those, and so on. Randomly deciding *whether* to split makes a picture that's busy in some places and calm in others:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  depth: $genart.params.range({ name: "Depth", desc: "Most splits", min: 1, max: 8, step: 1, default: 6 }),
  chance: $genart.params.range({ name: "Split chance", desc: "Chance a square splits again", min: 0.3, max: 1, step: 0.05, default: 0.7 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const [bg, ...inks] = lab.palette(["#f4f1ea", "#111111", "#d7263d", "#1b4f9c", "#f2c14e"]);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = "#111111";
ctx.lineWidth = 3;

function square(x, y, size, depth) {
  if (depth > 0 && (depth === param("depth") || rnd() < param("chance"))) {
    const h = size / 2;
    square(x, y, h, depth - 1);
    square(x + h, y, h, depth - 1);
    square(x, y + h, h, depth - 1);
    square(x + h, y + h, h, depth - 1);
    return;
  }
  ctx.fillStyle = rnd() < 0.25 ? lab.pick(inks) : bg;   // most squares stay plain
  ctx.fillRect(x, y, size, size);
  ctx.strokeRect(x, y, size, size);
}

square(0, 0, width, param("depth"));
```

Each extra level of **Depth** can multiply the number of squares by four, so depth 8 can mean up to 65,536 squares. Recursion grows fast.

## A fractal tree

A branch is a line, and at its end two smaller branches grow at an angle. That one rule makes a tree:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  depth: $genart.params.range({ name: "Depth", desc: "Branch levels", min: 1, max: 12, step: 1, default: 10 }),
  spread: $genart.params.range({ name: "Spread", desc: "Angle between branches (degrees)", min: 5, max: 90, step: 1, default: 25 }),
  shrink: $genart.params.range({ name: "Shrink", desc: "Each branch vs. its parent", min: 0.5, max: 0.85, step: 0.01, default: 0.72 }),
  wobble: $genart.params.range({ name: "Wobble", desc: "Random variation", min: 0, max: 1, step: 0.05, default: 0.35 }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
ctx.fillStyle = "#f2efe6";
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = "#2d4a3e";
ctx.lineCap = "round";

const toRad = Math.PI / 180;
function branch(x, y, angle, len, depth) {
  if (depth === 0) return;
  const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
  ctx.lineWidth = depth * 0.9;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const w = param("wobble");
  const spread = param("spread") * toRad;
  branch(x2, y2, angle - spread * (1 + (rnd() - 0.5) * w), len * param("shrink") * (1 + (rnd() - 0.5) * w), depth - 1);
  branch(x2, y2, angle + spread * (1 + (rnd() - 0.5) * w), len * param("shrink") * (1 + (rnd() - 0.5) * w), depth - 1);
}

branch(width / 2, height * 0.95, -Math.PI / 2, height * 0.25, param("depth"));
```

> **Try this:** set **Wobble** to 0 for a perfectly symmetric tree, then slowly raise it. A little randomness is what makes it look grown instead of drawn.

## L-systems: recursion as text

An **L-system** describes a shape as a string of instructions that grows by rewriting itself. You start with a short string (the *axiom*) and repeatedly replace each letter by a rule:

- Axiom: `F`
- Rule: `F → F[+F]F[-F]F`

Then you read the final string as instructions for a pen (a "turtle"): `F` draws forward, `+` and `-` turn, `[` saves the position, `]` jumps back to it.

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  steps: $genart.params.range({ name: "Generations", desc: "How many rewrites", min: 1, max: 5, step: 1, default: 4 }),
  turn: $genart.params.range({ name: "Turn", desc: "Angle for + and - (degrees)", min: 10, max: 60, step: 0.5, default: 25.7 }),
});

const { ctx, width, height } = lab.canvas();
ctx.fillStyle = "#0b0b10";
ctx.fillRect(0, 0, width, height);
ctx.strokeStyle = "#c6ff00";
ctx.lineWidth = 1.2;

// 1. Grow the string
const rules = { F: "F[+F]F[-F]F" };
let s = "F";
for (let i = 0; i < param("steps"); i++) {
  s = [...s].map((c) => rules[c] ?? c).join("");
}

// 2. Draw it with a turtle
const len = height * 0.9 / 3 ** param("steps");
const turn = param("turn") * Math.PI / 180;
let x = width / 2, y = height * 0.98, a = -Math.PI / 2;
const stack = [];
ctx.beginPath();
ctx.moveTo(x, y);
for (const c of s) {
  if (c === "F") { x += Math.cos(a) * len; y += Math.sin(a) * len; ctx.lineTo(x, y); }
  else if (c === "+") { a += turn; }
  else if (c === "-") { a -= turn; }
  else if (c === "[") { stack.push([x, y, a]); }
  else if (c === "]") { [x, y, a] = stack.pop(); ctx.moveTo(x, y); }
}
ctx.stroke();
```

The string grows about five times longer every generation, which is why **Generations** stops at 5: that's already over 15,000 letters.

> **Try this:** change the rule to `"FF-[-F+F+F]+[+F-F-F]"` and the turn to 22.5 for a bushier plant.

## Challenge

Make a **fractal tree whose branches change color** from trunk to tips: dark at the base, bright at the ends. Hint: you already know the depth inside `branch()`; use `lab.map(depth, 0, param("depth"), 90, 25)` as the lightness in `` `hsl(110, 45%, ${light}%)` ``.
