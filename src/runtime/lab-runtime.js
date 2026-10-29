// Runs inside the sandboxed sketch iframe, after genart.min.js and before the
// user's sketch. Plain JS on purpose: it is inlined as text into the iframe.
// Expects window.__LAB = { seed, values, width, height, dpr, mode, channel }.
(() => {
  const cfg = window.__LAB;
  const post = (msg) => parent.postMessage({ ...msg, channel: cfg.channel }, "*");

  // ---- errors, logs, heartbeat ---------------------------------------------
  const fmt = (v) => {
    if (v instanceof Error) return v.message;
    if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
    return String(v);
  };
  // First line number that falls inside the user's script (frames from this runtime are negative).
  const lineOf = (lineno, stack) => {
    const nums = [lineno, ...[...String(stack || "").matchAll(/(?:srcdoc|<anonymous>):(\d+)/g)].map((m) => Number(m[1]))];
    return nums.map((n) => (n ? n - cfg.lineOffset : 0)).find((n) => n > 0);
  };
  window.addEventListener("error", (e) =>
    post({ type: "lab:error", message: e.message, line: lineOf(e.lineno, e.error?.stack) }),
  );
  window.addEventListener("unhandledrejection", (e) =>
    post({ type: "lab:error", message: fmt(e.reason), line: lineOf(0, e.reason?.stack) }),
  );
  for (const level of ["log", "info", "warn", "error"]) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      post({ type: "lab:log", level, text: args.map(fmt).join(" ").slice(0, 2000) });
    };
  }
  setInterval(() => post({ type: "lab:alive" }), 1000);

  // ---- loop protection -------------------------------------------------------
  // The host rewrites loops to call __lp(); a single task may not loop for more
  // than LOOP_MS. The budget resets at the start of every animation frame/timer.
  const LOOP_MS = 5000;
  let taskStart = performance.now();
  window.__lp = () => {
    if (performance.now() - taskStart > LOOP_MS) {
      taskStart = Infinity; // make every loop bail out from here on
      throw new Error(`A loop ran for over ${LOOP_MS / 1000}s and was stopped (infinite loop?)`);
    }
  };
  const resetting = (fn) => (cb, ...rest) =>
    fn((...a) => { taskStart = performance.now(); return cb(...a); }, ...rest);
  window.requestAnimationFrame = resetting(window.requestAnimationFrame.bind(window));
  window.setTimeout = resetting(window.setTimeout.bind(window));
  window.setInterval = resetting(window.setInterval.bind(window));

  // ---- seeded PRNG + simplex noise ---------------------------------------------
  // cyrb128: string -> four 32-bit seeds for SFC32
  const cyrb128 = (str) => {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  };

  const prng = new $genart.prng.SFC32(cyrb128(cfg.seed));
  // A separate stream for noise, so adding noise calls doesn't shift other randomness.
  const noiseRnd = new $genart.prng.SFC32(cyrb128(cfg.seed + ":noise")).rnd;

  const perm = new Uint8Array(512);
  {
    const p = new Uint8Array(256).map((_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(noiseRnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }
  const G3 = [1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1, 1,0,-1, -1,0,-1, 0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1];

  // Simplex noise after Stefan Gustavson's public-domain reference. Output in [-1, 1].
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const noise2D = (xin, yin) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const corner = (x, y, gi) => {
      let t = 0.5 - x * x - y * y;
      if (t < 0) return 0;
      gi = (gi % 12) * 3;
      t *= t;
      return t * t * (G3[gi] * x + G3[gi + 1] * y);
    };
    return 70 * (
      corner(x0, y0, perm[ii + perm[jj]]) +
      corner(x1, y1, perm[ii + i1 + perm[jj + j1]]) +
      corner(x2, y2, perm[ii + 1 + perm[jj + 1]])
    );
  };

  const F3 = 1 / 3, G3c = 1 / 6;
  const noise3D = (xin, yin, zin) => {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3c;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3c, y1 = y0 - j1 + G3c, z1 = z0 - k1 + G3c;
    const x2 = x0 - i2 + 2 * G3c, y2 = y0 - j2 + 2 * G3c, z2 = z0 - k2 + 2 * G3c;
    const x3 = x0 - 1 + 3 * G3c, y3 = y0 - 1 + 3 * G3c, z3 = z0 - 1 + 3 * G3c;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const corner = (x, y, z, gi) => {
      let t = 0.6 - x * x - y * y - z * z;
      if (t < 0) return 0;
      gi = (gi % 12) * 3;
      t *= t;
      return t * t * (G3[gi] * x + G3[gi + 1] * y + G3[gi + 2] * z);
    };
    return 32 * (
      corner(x0, y0, z0, perm[ii + perm[jj + perm[kk]]]) +
      corner(x1, y1, z1, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]) +
      corner(x2, y2, z2, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]) +
      corner(x3, y3, z3, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]])
    );
  };

  // ---- GenArtAPI platform adapter -------------------------------------------------
  const clone = (x) => JSON.parse(JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  // Report specs plus the values the sketch actually reads (specs alone may omit them).
  let readParam;
  const sendParams = () => {
    const specs = $genart.paramSpecs;
    if (!specs) return;
    const values = {};
    if (readParam) for (const id of Object.keys(specs)) { try { values[id] = readParam(id); } catch { /* dynamic param */ } }
    post({ type: "lab:params", params: clone(specs), values: clone(values) });
  };
  let mainCanvas;

  const capture = (el, maxSize) => {
    el = el || mainCanvas || document.querySelector("canvas");
    if (!el || !(el instanceof HTMLCanvasElement)) return post({ type: "lab:capture", error: "no canvas" });
    let src = el;
    if (maxSize && Math.max(el.width, el.height) > maxSize) {
      const k = maxSize / Math.max(el.width, el.height);
      src = document.createElement("canvas");
      src.width = Math.round(el.width * k);
      src.height = Math.round(el.height * k);
      src.getContext("2d").drawImage(el, 0, 0, src.width, src.height);
    }
    src.toBlob((blob) => post({ type: "lab:capture", blob, width: el.width, height: el.height }), "image/png");
  };

  $genart.setAdapter({
    id: "art-lab@0.1",
    mode: cfg.mode,
    screen: { width: cfg.width, height: cfg.height, dpr: cfg.dpr },
    prng,
    seed: cfg.seed,

    async updateParam(id) {
      if (Object.prototype.hasOwnProperty.call(cfg.values, id)) return { value: cfg.values[id] };
    },
    setTraits(traits) { post({ type: "lab:traits", traits: clone(traits) }); },
    capture(el) { capture(el); },
  });
  $genart.on("genart:param-change", sendParams);
  const setParams = $genart.setParams.bind($genart);
  $genart.setParams = async (...args) => {
    readParam = await setParams(...args);
    sendParams();
    return readParam;
  };

  // Called after the sketch's top-level code. A timeout (not rAF, which is
  // throttled in hidden cross-origin frames) lets pending paints settle.
  window.__labDone = () => setTimeout(() => post({ type: "lab:done" }), 0);

  window.addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.channel !== cfg.channel) return;
    if (e.data.type === "lab:capture-request") capture(undefined, e.data.maxSize);
  });

  // ---- beginner helpers ----------------------------------------------------------
  const rnd = () => prng.rnd();
  window.lab = {
    canvas() {
      const { width, height, dpr } = $genart.screen;
      const canvas = document.createElement("canvas");
      const tile = cfg.tile;
      canvas.width = tile ? tile.w : Math.round(width * dpr);
      canvas.height = tile ? tile.h : Math.round(height * dpr);
      document.body.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      // A tile draws the same picture, shifted so only its region lands on the canvas.
      if (tile) ctx.setTransform(dpr, 0, 0, dpr, -tile.x, -tile.y);
      else ctx.scale(dpr, dpr);
      mainCanvas = canvas;
      return { canvas, ctx, width, height };
    },
    noise2D,
    noise3D,
    random: (min = 0, max = 1) => min + rnd() * (max - min),
    pick: (arr) => arr[Math.floor(rnd() * arr.length)],
    gaussian(mean = 0, sd = 1) {
      const u = 1 - rnd(), v = rnd();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    map: (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c),
    // The palette picked in the Tweak panel (stored in values under "$palette"),
    // else the sketch's own fallback, else a neutral default.
    palette(fallback) {
      const p = cfg.values && cfg.values["$palette"];
      if (Array.isArray(p) && p.length) return p.slice();
      return Array.isArray(fallback) && fallback.length ? fallback.slice() : ["#f1ece2", "#1d1b22", "#e4572e", "#29335c", "#f3a712"];
    },
  };

  post({ type: "lab:ready" });
})();
