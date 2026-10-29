---
title: 8. Color: palettes, HSL, OKLCH and harmony
summary: Describing color by hue, saturation and lightness, building palettes with harmony rules, and why value matters most.
---

Most generative pieces that look "off" have fine shapes and unlucky colors. Random colors almost never work, but a little structure goes a long way.

## Thinking in hue, saturation, lightness

`"#e4572e"` is how a computer stores a color, not how people think about one. **HSL** splits a color into three knobs you can reason about:

- **Hue**, 0–360: where on the color wheel (0 red, 120 green, 240 blue)
- **Saturation**, 0–100%: gray to vivid
- **Lightness**, 0–100%: black to white

Canvas understands it directly: `ctx.fillStyle = "hsl(200, 70%, 50%)"`. Here are hue across the canvas and lightness down it:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  sat: $genart.params.range({ name: "Saturation", desc: "Gray to vivid", min: 0, max: 100, step: 1, default: 70 }),
});

const { ctx, width, height } = lab.canvas();
const cols = 24, rows = 10;
const w = width / cols, h = height / rows;
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const hue = (x / cols) * 360;
    const light = 90 - (y / (rows - 1)) * 80;
    ctx.fillStyle = `hsl(${hue}, ${param("sat")}%, ${light}%)`;
    ctx.fillRect(x * w, y * h, w + 1, h + 1);
  }
}
```

## OKLCH: lightness you can trust

Look at the row above: yellow at "50% lightness" looks much brighter than blue at "50%". HSL's lightness isn't how bright a color *looks*. **OKLCH** fixes that: same `L`, same perceived brightness, whatever the hue. Modern browsers accept it in canvas too: `oklch(L C H)`, with `L` from 0 to 1, chroma `C` roughly 0–0.37, hue `H` in degrees.

```sketch
await $genart.waitForAdapter();
await $genart.setParams({});

const { ctx, width, height } = lab.canvas();
const n = 24, w = width / n;
for (let i = 0; i < n; i++) {
  const hue = (i / n) * 360;
  ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;            // top: HSL, uneven
  ctx.fillRect(i * w, 0, w + 1, height / 2);
  ctx.fillStyle = `oklch(0.7 0.15 ${hue})`;           // bottom: OKLCH, even
  ctx.fillRect(i * w, height / 2, w + 1, height / 2);
}
```

The bottom half reads as one even band. When you generate colors in code, pick them in OKLCH and they'll sit together much better.

## Harmony rules

Color harmony is mostly a question of **which hues** you combine. Pick one base hue, then derive the others by rotating around the wheel:

| Scheme | Hues | Feel |
|---|---|---|
| Analogous | base, base ± 30 | Calm, natural |
| Complementary | base, base + 180 | Strong contrast |
| Triadic | base, + 120, + 240 | Lively, balanced |
| Split complementary | base, + 150, + 210 | Contrast without clashing |

Here the base hue comes from the seed, so every seed is a new, still-harmonious palette:

```sketch
await $genart.waitForAdapter();
const param = await $genart.setParams({
  scheme: $genart.params.choice({ name: "Scheme", desc: "Harmony rule", options: [["analogous", "Analogous"], ["complementary", "Complementary"], ["triadic", "Triadic"], ["split", "Split complementary"]], default: "triadic" }),
});

const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd;
const base = rnd() * 360;
const offsets = { analogous: [0, 30, -30], complementary: [0, 180], triadic: [0, 120, 240], split: [0, 150, 210] }[param("scheme")];
const colors = offsets.map((o) => `oklch(0.72 0.14 ${(base + o + 360) % 360})`);

ctx.fillStyle = `oklch(0.2 0.03 ${base})`;      // a dark, slightly tinted background
ctx.fillRect(0, 0, width, height);
for (let i = 0; i < 160; i++) {
  ctx.fillStyle = lab.pick(colors);
  ctx.beginPath();
  ctx.arc(rnd() * width, rnd() * height, 6 + rnd() ** 3 * 70, 0, Math.PI * 2);
  ctx.fill();
}
```

## Palettes

The studio has a **Palette** panel in the Tweak tab. Sketches read the picked colors with `lab.palette()`, so you can recolor any sketch without touching its code. A good habit:

```js
const [bg, ...inks] = lab.palette(["#f1ece2", "#1d1b22", "#e4572e"]);  // your own fallback colors
```

The first color is usually the background, the rest are "inks". Change palettes on the *Palette blocks* template to see how much the same shapes depend on color.

## Value beats hue

The most useful color rule in art has nothing to do with hue: **value** (how light or dark) carries the picture. If your piece reads well in grayscale, it'll read well in color.

- Keep one value range for the background and a clearly different one for the subject
- Use one or two **accent** colors sparingly, for example 5% of the shapes, as in lesson 2's weighted choice
- Saturated colors next to grays look more saturated: vivid everywhere means vivid nowhere

> **Try this:** in the harmony example, change the background to `oklch(0.95 0.02 ${base})` (light) and the circles to `oklch(0.45 0.14 ...)` (darker). Same hues, completely different mood.

## Challenge

Make a **grid of squares** where each square's color is the base hue plus a small random shift (±20°) in OKLCH, and **one random square** is the complementary color (base + 180) as an accent. Hint: pick the accent's index once with `Math.floor(rnd() * total)`.
