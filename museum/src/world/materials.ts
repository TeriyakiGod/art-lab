import { DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, AdditiveBlending, Color } from "three/webgpu";
import {
  Fn, abs, attribute, bumpMap, color, cos, float, fract, max, min, mix, mx_fractal_noise_float, mx_noise_float,
  positionLocal, positionWorld, sin, smoothstep, time, uv, vec2, vec3, vertexColor,
} from "three/tsl";

/**
 * Every surface in the museum, procedural so nothing has to be downloaded. Built once and shared.
 * Instanced meshes multiply these by their per-instance color.
 */

/** Concrete-like panels, 1.5 × 3 m, with thin shadow gaps between them. */
export function wallMaterial() {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  m.colorNode = Fn(() => {
    const p = positionWorld;
    const along = p.x.add(p.z);
    const u = fract(along.div(1.5)), v = fract(p.y.div(3));
    const du = min(u, u.oneMinus()).mul(1.5), dv = min(v, v.oneMinus()).mul(3);
    const seam = smoothstep(0.004, 0.02, min(du, dv));
    const grain = mx_fractal_noise_float(p.mul(1.7), 3).mul(0.05);
    return vec3(seam.mul(0.4).add(0.6).add(grain));
  })();
  m.roughnessNode = float(0.86).add(mx_noise_float(positionWorld.mul(3)).mul(0.08));
  return m;
}

/** Polished terrazzo: soft clouding, fine stone chips, a little sheen. `tint` for floors that aren't instanced. */
export function floorMaterial(tint = "#ffffff") {
  const m = new MeshStandardNodeMaterial({ metalness: 0 });
  const p = positionWorld.xz;
  m.colorNode = Fn(() => {
    const cloud = mx_fractal_noise_float(vec3(p.mul(0.3), 0), 3).mul(0.08);
    const chips = smoothstep(0.42, 0.5, mx_noise_float(vec3(p.mul(22), 3))).mul(0.35);
    const fine = smoothstep(0.5, 0.56, mx_noise_float(vec3(p.mul(55), 7))).mul(0.25);
    return color(tint).mul(float(0.92).add(cloud).add(chips).add(fine));
  })();
  m.roughnessNode = float(0.3).add(mx_noise_float(vec3(p.mul(1.3), 1)).mul(0.08));
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
  m.colorNode = color(tint).mul(float(0.94).add(mx_fractal_noise_float(positionWorld.mul(2.2), 2).mul(0.06)));
  return m;
}

/** Travertine: warm stone with fine horizontal veins. */
export function stoneMaterial() {
  const m = new MeshStandardNodeMaterial({ roughness: 0.55 });
  m.colorNode = Fn(() => {
    const p = positionWorld;
    const veins = mx_fractal_noise_float(vec3(p.x.mul(3).add(p.z.mul(3)), p.y.mul(28), 0), 3);
    const pits = smoothstep(0.55, 0.6, mx_noise_float(p.mul(30))).mul(0.12);
    return mix(color("#bdb3a2"), color("#9c8f7a"), veins.mul(0.5).add(0.5)).sub(pits);
  })();
  return m;
}

/** Oak with grain running along the piece's local X axis. */
export function woodMaterial() {
  const m = new MeshStandardNodeMaterial({ roughness: 0.5 });
  m.colorNode = Fn(() => {
    const p = positionLocal;
    const grain = mx_fractal_noise_float(vec3(p.x.mul(1.5), p.y.mul(40), p.z.mul(40)), 3);
    const rings = sin(grain.mul(18)).mul(0.5).add(0.5);
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
  const m = new MeshStandardNodeMaterial({ color: "#03161b", roughness: 0.03, metalness: 0.15 });
  const p = positionWorld;
  const fromWall = p.z.sub(wallZ);
  const drift = mx_fractal_noise_float(vec3(p.x.mul(1.1), p.z.mul(1.1), time.mul(0.35)), 3).mul(0.5);
  const rings = sin(fromWall.mul(9).sub(time.mul(3.5))).mul(0.25).mul(fromWall.mul(-0.35).exp());
  m.normalNode = bumpMap(drift.add(rings), float(0.6));
  return m;
}

/** The falling sheet: bright streaks rushing down over the dark wall, thinning out toward the edges. */
export function waterfallMaterial() {
  const m = new MeshStandardNodeMaterial({ color: "#9fd8e0", roughness: 0.08, transparent: true, depthWrite: false });
  const st = uv();
  const flow = Fn(() => {
    const fast = mx_noise_float(vec3(st.x.mul(70), st.y.mul(5).add(time.mul(2.4)), 0));
    const slow = mx_noise_float(vec3(st.x.mul(18), st.y.mul(2).add(time.mul(1.1)), 4));
    return smoothstep(0.05, 0.75, fast.mul(0.65).add(slow.mul(0.35)));
  })();
  const edges = smoothstep(0, 0.04, st.x).mul(smoothstep(0, 0.04, st.x.oneMinus()));
  m.emissiveNode = color("#7fd3e2").mul(flow.mul(0.7).add(smoothstep(0.93, 1, st.y).mul(1.5)));
  m.opacityNode = flow.mul(0.5).add(0.18).mul(edges);
  return m;
}

/** White water where the sheet hits the pool. */
export function foamMaterial() {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  const st = uv();
  const n = mx_fractal_noise_float(vec3(st.x.mul(30), st.y.mul(6).sub(time.mul(1.6)), time.mul(0.5)), 3);
  m.colorNode = vec3(0.8, 0.95, 1);
  m.opacityNode = smoothstep(0, 0.9, n.mul(0.5).add(0.5)).mul(st.y.oneMinus().pow(1.5)).mul(0.45);
  return m;
}

/** The skylight: a bright field with a fine mullion grid, bright enough to bloom. */
export function skylightMaterial() {
  const m = new MeshBasicNodeMaterial({ toneMapped: false });
  m.colorNode = Fn(() => {
    const g = fract(uv().mul(vec2(8, 10)));
    const line = min(min(g.x, g.x.oneMinus()), min(g.y, g.y.oneMinus()));
    const lit = smoothstep(0.015, 0.04, line);
    const glow = float(1).sub(abs(uv().sub(0.5)).length().mul(0.6));
    return mix(vec3(0.05, 0.05, 0.06), vec3(2.1, 2.2, 2.4).mul(glow), lit);
  })();
  return m;
}

/** A soft glow on the wall behind each work, in the room's accent color. */
export function haloMaterial(accent: string) {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  const d = abs(uv().sub(0.5)).mul(2);
  const edge = max(d.x, d.y);
  m.colorNode = color(accent);
  m.opacityNode = smoothstep(1, 0.5, edge).pow(2).mul(0.12);
  return m;
}
