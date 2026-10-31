import {
  DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, AdditiveBlending, Color, DataTexture, LinearFilter,
  LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType,
} from "three/webgpu";
import {
  Fn, abs, attribute, bumpMap, color, cos, float, fract, max, min, mix, positionLocal, positionWorld, sin,
  smoothstep, texture, time, uniform, uv, vec2, vec3, vertexColor,
} from "three/tsl";
import { rng } from "../../../shared/museum/rng";
import type { hourUniform } from "./daylight";

/**
 * Every surface in the museum, procedural so nothing has to be downloaded. Built once and shared.
 * Instanced meshes multiply these by their per-instance color.
 *
 * Noise comes from one small tiling texture baked at startup, not computed per pixel: per-pixel
 * noise made every surface several times more expensive, which weaker laptops couldn't afford.
 */

const NOISE_SIZE = 256;

/** Smooth value noise that tiles every `period` lattice cells across the texture. */
function valueNoise(period: number, seed: number): Float32Array {
  const r = rng("noise", seed, period);
  const lattice = Float32Array.from({ length: period * period }, () => r());
  const out = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  const fade = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      const fx = (x / NOISE_SIZE) * period, fy = (y / NOISE_SIZE) * period;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fade(fx - x0), ty = fade(fy - y0);
      const at = (i: number, j: number) => lattice[((j % period) * period) + (i % period)];
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      out[y * NOISE_SIZE + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/**
 * R: soft fractal clouds (4 octaves from 4 cells). G: fine speckle (32 cells). B: very fine (64 cells).
 * A: medium (16 cells).
 */
const noiseTexture = (() => {
  let tex: DataTexture | null = null;
  return () => {
    if (tex) return tex;
    const octaves = [4, 8, 16, 32].map((p, i) => valueNoise(p, i));
    const g = valueNoise(32, 10), b = valueNoise(64, 11), a = valueNoise(16, 12);
    const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
    for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
      const fbm = octaves[0][i] * 0.53 + octaves[1][i] * 0.27 + octaves[2][i] * 0.13 + octaves[3][i] * 0.07;
      data.set([fbm * 255, g[i] * 255, b[i] * 255, a[i] * 255], i * 4);
    }
    tex = new DataTexture(data, NOISE_SIZE, NOISE_SIZE, RGBAFormat, UnsignedByteType);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };
})();

/** Samples the noise texture; each channel's features are `cells` per texture, so scale accordingly. */
const noise = (st: Parameters<typeof texture>[1]) => texture(noiseTexture(), st);

/** Concrete-like panels, 1.5 × 3 m, with thin shadow gaps between them. */
export function wallMaterial() {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  m.colorNode = Fn(() => {
    const p = positionWorld;
    const along = p.x.add(p.z);
    const u = fract(along.div(1.5)), v = fract(p.y.div(3));
    const du = min(u, u.oneMinus()).mul(1.5), dv = min(v, v.oneMinus()).mul(3);
    const seam = smoothstep(0.004, 0.02, min(du, dv));
    const n = noise(vec2(along, p.y).mul(0.42));
    return vec3(seam.mul(0.4).add(0.6).add(n.r.sub(0.5).mul(0.1)));
  })();
  m.roughnessNode = float(0.82).add(noise(vec2(positionWorld.x.add(positionWorld.z), positionWorld.y).mul(0.19)).a.mul(0.12));
  return m;
}

/** Polished terrazzo: soft clouding, fine stone chips, a little sheen. `tint` for floors that aren't instanced. */
export function floorMaterial(tint = "#ffffff") {
  const m = new MeshStandardNodeMaterial({ metalness: 0 });
  const p = positionWorld.xz;
  m.colorNode = Fn(() => {
    const coarse = noise(p.mul(0.075));
    const fine = noise(p.mul(0.7));
    const chips = smoothstep(0.66, 0.72, fine.g).mul(0.35);
    const specks = smoothstep(0.7, 0.75, fine.b).mul(0.25);
    return color(tint).mul(float(0.88).add(coarse.r.mul(0.16)).add(chips).add(specks));
  })();
  m.roughnessNode = float(0.26).add(noise(p.mul(0.08)).a.mul(0.12));
  return m;
}

export function ceilingMaterial() {
  return new MeshStandardNodeMaterial({ color: "#ffffff", roughness: 1 });
}

/** Lines of light; values above 1 so bloom picks them up. */
export function lightMaterial(intensity = 2.4) {
  const m = new MeshBasicNodeMaterial({ toneMapped: false });
  m.color = new Color(intensity, intensity, intensity);
  return m;
}

/** Pale smooth concrete for the balcony slabs and stair spine. */
export function concreteMaterial(tint = "#d9d5ce") {
  const m = new MeshStandardNodeMaterial({ roughness: 0.75 });
  m.colorNode = color(tint).mul(float(0.94).add(noise(vec2(positionWorld.x.add(positionWorld.z), positionWorld.y.add(positionWorld.z)).mul(0.5)).r.mul(0.1)));
  return m;
}

/** Travertine: warm stone with fine horizontal veins. */
export function stoneMaterial() {
  const m = new MeshStandardNodeMaterial({ roughness: 0.55 });
  m.colorNode = Fn(() => {
    const p = positionWorld;
    const veins = noise(vec2(p.x.add(p.z).mul(0.6), p.y.mul(5))).r;
    const pits = smoothstep(0.72, 0.78, noise(vec2(p.x.add(p.z), p.y.add(p.z)).mul(1.1)).b).mul(0.12);
    return mix(color("#bdb3a2"), color("#9c8f7a"), veins).sub(pits);
  })();
  return m;
}

/** Oak with grain running along the piece's local X axis. */
export function woodMaterial() {
  const m = new MeshStandardNodeMaterial({ roughness: 0.5 });
  m.colorNode = Fn(() => {
    const p = positionLocal;
    const grain = noise(vec2(p.x.mul(0.35), p.y.add(p.z).mul(9))).r;
    const rings = sin(grain.mul(30)).mul(0.5).add(0.5);
    return mix(color("#7c6048"), color("#b0906e"), rings.mul(0.6).add(grain.mul(0.4)));
  })();
  return m;
}

export function steelMaterial() {
  return new MeshStandardNodeMaterial({ color: "#1d1e21", roughness: 0.35, metalness: 0.85 });
}

export function glassMaterial() {
  return new MeshStandardNodeMaterial({ color: "#cfe3e6", roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false });
}

/** Leaves sway in a slow indoor draft; how much is the per-vertex `sway` (0 at the base, 1 at the tips). */
export function leafMaterial() {
  const m = new MeshStandardNodeMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.55 });
  // A little light of their own, so leaves turned away from every lamp aren't black cut-outs.
  m.emissiveNode = vertexColor().mul(0.12);
  const sway = attribute("sway", "float");
  const p = positionLocal;
  const t = time;
  m.positionNode = p.add(vec3(
    sin(t.mul(1.3).add(p.x.mul(0.7)).add(p.z.mul(0.4))).add(sin(t.mul(2.7).add(p.y.mul(3))).mul(0.3)),
    float(0),
    cos(t.mul(1.1).add(p.x.mul(0.5)).sub(p.z.mul(0.7))),
  ).mul(sway.mul(0.035)));
  return m;
}

export function vertexColorMaterial(roughness = 0.8) {
  return new MeshStandardNodeMaterial({ vertexColors: true, roughness, side: DoubleSide });
}

/** The pool: dark water with drifting ripples, strongest where the water wall lands. */
export function waterSurfaceMaterial(wallZ: number) {
  // Partly see-through, so the koi show beneath the reflections.
  const m = new MeshStandardNodeMaterial({ color: "#062a30", roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.7, depthWrite: false });
  const p = positionWorld;
  const fromWall = p.z.sub(wallZ);
  // Two layers of the cloud noise drifting past each other read as moving water.
  const drift = noise(p.xz.mul(0.22).add(vec2(time.mul(0.03), time.mul(0.02)))).r
    .add(noise(p.xz.mul(0.31).sub(vec2(time.mul(0.025), time.mul(-0.035)))).r).mul(0.5);
  const rings = sin(fromWall.mul(9).sub(time.mul(3.5))).mul(0.25).mul(fromWall.mul(-0.35).exp());
  m.normalNode = bumpMap(drift.add(rings), float(0.6));
  return m;
}

/**
 * The falling sheet. Water leaves the lip as a smooth glassy sheet, then breaks into streaks that
 * speed up as they fall: each point shows the water that left the lip t_fall = sqrt(2d/g) ago, so
 * features accelerate and stretch toward the bottom like real falling water.
 */
export function waterfallMaterial(height: number) {
  const m = new MeshStandardNodeMaterial({ color: "#9fd8e0", roughness: 0.06, transparent: true, depthWrite: false });
  const st = uv();
  const fallen = st.y.oneMinus().mul(height); // meters below the lip (uv.y is 1 at the top)
  const tFall = fallen.mul(2 / 9.81).sqrt();
  const emitted = time.sub(tFall); // when the water here left the lip
  const flow = Fn(() => {
    const fast = noise(vec2(st.x.mul(5.5), emitted.mul(0.9))).g;
    const slow = noise(vec2(st.x.mul(1.8), emitted.mul(0.35))).a;
    return smoothstep(0.32, 0.78, fast.mul(0.6).add(slow.mul(0.4)));
  })();
  // Smooth near the lip, broken up further down.
  const broken = smoothstep(0, 2.5, fallen);
  const sheet = mix(float(0.55), flow, broken);
  const edges = smoothstep(0, 0.03, st.x).mul(smoothstep(0, 0.03, st.x.oneMinus()));
  const lip = smoothstep(0.985, 1, st.y);
  m.emissiveNode = color("#7fd3e2").mul(sheet.mul(0.75).add(lip.mul(1.6)));
  m.opacityNode = sheet.mul(0.5).add(0.16).mul(edges);
  return m;
}

/** Spray where the sheet lands: soft billowing white, rising and fading. */
export function mistMaterial() {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  const st = uv();
  const n = noise(vec2(st.x.mul(1.4).add(time.mul(0.02)), st.y.mul(0.5).sub(time.mul(0.06)))).r;
  m.colorNode = vec3(0.75, 0.92, 1);
  const fadeUp = st.y.oneMinus().pow(2);
  const sides = smoothstep(0, 0.15, st.x).mul(smoothstep(0, 0.15, st.x.oneMinus()));
  m.opacityNode = smoothstep(0.35, 0.8, n).mul(fadeUp).mul(sides).mul(0.35);
  return m;
}

/**
 * White water where the sheet hits the pool, pushed out across the surface. The plane lies flat with
 * its uv top edge against the wall, so the pattern flows toward lower v (away from the wall) and is
 * thickest at the impact line.
 */
export function foamMaterial() {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  const st = uv();
  const n = noise(vec2(st.x.mul(2), st.y.mul(0.4).add(time.mul(0.12)))).g;
  const churn = noise(vec2(st.x.mul(3.5).sub(time.mul(0.03)), st.y.mul(0.9).add(time.mul(0.2)))).b;
  m.colorNode = vec3(0.8, 0.95, 1);
  m.opacityNode = smoothstep(0.3, 0.85, n.mul(0.6).add(churn.mul(0.4))).mul(st.y.pow(2)).mul(0.6);
  return m;
}

/**
 * The skylight: the real sky for the visitor's time of day behind a fine mullion grid. Blue with
 * drifting clouds by day, warm at sunrise and sunset, deep blue with twinkling stars at night.
 * `hour` is a uniform (0–24) updated from the clock.
 */
export function skylightMaterial(hour: typeof hourUniform) {
  const m = new MeshBasicNodeMaterial({ toneMapped: false });
  m.colorNode = Fn(() => {
    const st = uv();
    const h = hour;
    const day = smoothstep(5, 8, h).mul(smoothstep(18, 21, h).oneMinus());
    const gold = max(float(1).sub(abs(h.sub(6.8)).div(1.3)), float(1).sub(abs(h.sub(19.2)).div(1.3))).clamp(0, 1);
    // Looking straight up: zenith in the middle, a little lighter toward the frame.
    const edge = abs(st.sub(0.5)).length().mul(1.4);
    // At sunrise and sunset the zenith deepens to violet and the frame glows orange.
    const zenith = mix(mix(vec3(0.01, 0.015, 0.05), vec3(0.18, 0.42, 0.85), day), vec3(0.17, 0.12, 0.34), gold.mul(0.75));
    const rim = mix(mix(vec3(0.03, 0.04, 0.1), vec3(0.55, 0.75, 0.95), day), vec3(1, 0.45, 0.18), gold.mul(0.8));
    let sky = mix(zenith, rim, edge);
    // Clouds: two layers of the cloud noise drifting slowly; lit white by day, dark against the stars at night.
    const c1 = noise(st.mul(0.55).add(vec2(time.mul(0.0025), time.mul(0.001)))).r;
    const c2 = noise(st.mul(1.3).add(vec2(time.mul(0.004), time.mul(-0.002)))).r;
    const cloud = smoothstep(0.5, 0.78, c1.mul(0.7).add(c2.mul(0.3)));
    const cloudColor = mix(mix(vec3(0.05, 0.06, 0.09), vec3(1.05, 1.05, 1.08), day), vec3(1, 0.5, 0.42), gold.mul(0.7));
    sky = mix(sky, cloudColor, cloud.mul(0.85));
    // Stars: the finest noise channel's brightest specks, twinkling, only at night and not behind clouds.
    const speck = noise(st.mul(3.1)).b;
    const twinkle = sin(time.mul(2.3).add(speck.mul(90))).mul(0.35).add(0.65);
    const stars = smoothstep(0.93, 0.97, speck).mul(twinkle).mul(day.oneMinus()).mul(cloud.oneMinus());
    sky = sky.add(vec3(stars.mul(1.4)));
    // Bright enough by day to bloom and read as light pouring in.
    const lit = sky.mul(mix(float(1), float(1.7), day)).mul(gold.mul(-0.3).add(1));
    const g = fract(st.mul(vec2(8, 10)));
    const line = min(min(g.x, g.x.oneMinus()), min(g.y, g.y.oneMinus()));
    return mix(vec3(0.03, 0.03, 0.035), lit, smoothstep(0.015, 0.04, line));
  })();
  return m;
}

/** A soft glow on the wall behind each work, in the room's accent color. */
export function haloMaterial(accent: string) {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  const d = abs(uv().sub(0.5)).mul(2);
  const edge = max(d.x, d.y);
  // A uniform, not a constant, so every halo shares one shader whatever its color.
  m.colorNode = uniform(new Color(accent));
  m.opacityNode = smoothstep(1, 0.5, edge).pow(2).mul(0.12);
  return m;
}
