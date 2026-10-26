/**
 * The "ii" in the hero, drawn in one WebGL2 layer: ceramic tiles (the human)
 * and LED points (the AI). It holds still. Both letters answer the same touch:
 * keys sink under the pointer on one, the matching LEDs light up in the minds'
 * colors on the other. Now and then a copy pass scans down both, row by row.
 *
 * The headline and actions (`data-d`) dither in with the same stepped 4×4
 * Bayer pattern as the letters set, once per page load.
 */
import { COLS, I_BITMAP, ROWS } from "@/lib/logo-geometry";

type Opts = {
  canvas: HTMLCanvasElement;
  root: HTMLElement;
  iiBox: HTMLElement;
  /** the minds' colors, for the LEDs */
  colors: string[];
  /** client-side return to "/": no intro */
  skipIntro: boolean;
  /** reduced motion: words shown, the page draws the static mark */
  still: boolean;
  /** called when the stage can't run (reduced motion or no WebGL2): the page draws the static mark */
  onStill?: () => void;
};

const MICRO = 9; // the letters are laid out on a 9×9 grid per cell
const PITCH = 10; // columns between the letters' centers
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] / 16;
const filled = (r: number, c: number) => !!I_BITMAP[r] && I_BITMAP[r][c] === "#";

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── stepped dither for DOM text ── */
let tiles: string[] | null = null;
function ditherTiles() {
  if (tiles) return tiles;
  tiles = [];
  for (let k = 0; k <= 16; k++) {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    for (let i = 0; i < 16; i++) if (BAYER[i] < k) x.fillRect((i % 4) * 2, Math.floor(i / 4) * 2, 2, 2);
    tiles.push(`url(${c.toDataURL()})`);
  }
  return tiles;
}
function dither(el: HTMLElement & { _l?: number }, v: number) {
  const lvl = Math.max(0, Math.min(16, Math.round(v * 8) * 2));
  if (el._l === lvl) return;
  el._l = lvl;
  const t = ditherTiles();
  if (lvl >= 16) {
    el.style.visibility = "visible";
    el.style.webkitMaskImage = el.style.maskImage = "none";
  } else if (lvl <= 0) el.style.visibility = "hidden";
  else {
    el.style.visibility = "visible";
    el.style.webkitMaskImage = el.style.maskImage = t[lvl];
  }
}

export function startIiStage(o: Opts): () => void {
  const words = Array.from(o.root.querySelectorAll<HTMLElement>("[data-d]"));
  const showAll = () => words.forEach((el) => dither(el, 1));
  const gl = o.still ? null : o.canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  if (!gl) {
    showAll();
    o.onStill?.();
    return () => {};
  }

  /* per point: aA position on the 9×9 layout (3), aD kind/rnd/thr/intro (4), aT col/row (2). kind 5 = tile, 6 = LED */
  const R = rng(20261017);
  const pts: number[] = [];
  const tileRank = (row: number) => (row <= 5 ? (5 - row) / 5 : (ROWS - 1 - row) / (ROWS - 1 - 7));
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      if (!filled(row, col)) continue;
      for (const letter of [0, 1]) {
        const off = letter === 0 ? -PITCH / 2 : PITCH / 2;
        const x0 = (off + col - COLS / 2) * MICRO;
        const y0 = (ROWS / 2 - row - 1) * MICRO;
        const rank = tileRank(row) * 0.8 + 0.04 * bayer(col + letter * 3, row);
        if (letter === 0) pts.push(x0 + 4, y0 + 5, 0, 5, R(), 0, rank, col, row);
        else for (let ly = 0; ly < 3; ly++) for (let lx = 0; lx < 3; lx++) pts.push(x0 + lx * 3 + 1, y0 + (MICRO - 1 - ly * 3), 0, 6, R(), 0, rank * 0.7 + R() * 0.3, col, row);
      }
    }
  const STRIDE = 9;
  const N = pts.length / STRIDE;
  const buf = new Float32Array(pts);
  const minds = o.colors.slice(0, 16).map(hexRgb);
  const NM = Math.max(1, minds.length);

  const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aA;
layout(location=1) in vec4 aD;
layout(location=2) in vec2 aT;
uniform vec2 uC, uRes;
uniform float uMicro, uStepT, uIntro, uDpr, uScan;
uniform vec3 uMind[${NM}];
uniform vec4 uHeat[38];
out vec4 vCol;
void main() {
  float kind = aD.x, rnd = aD.y, aux = aD.w;
  vec2 px = uC + vec2(aA.x, -aA.y) * uMicro; // layout y points up, the screen's down
  float size = floor(uMicro * (kind < 5.5 ? 8.0 : 2.4) + 0.5);
  float on = step(aux, uIntro);
  float settle = clamp((uIntro - aux) * 8.0, 0.0, 1.0);
  px.y += (1.0 - settle) * 10.0 * uDpr; // tiles rise into place
  vec3 col = vec3(0.949, 0.945, 0.925);
  float a = on;
  int idx = int(aT.y) * 6 + int(aT.x);
  float heat = uHeat[idx / 4][idx % 4];
  bool beam = uScan > -0.5 && abs(aT.y + 0.5 - uScan) < 0.75;
  if (kind < 5.5) {
    // the key sinks under the finger, a step at a time, and rises back
    float hs = floor(heat * heat * 4.0 + 0.001) / 4.0;
    col *= 1.0 - 0.5 * hs;
    size = max(1.0, size - floor(hs * size * 0.28 + 0.5));
    px += vec2(1.0, 1.0) * floor(hs * 2.0 * uDpr + 0.5);
    if (beam) col *= 0.55;
  } else {
    // the LED lights up in a mind's color and fades slowly
    float hs = floor(sqrt(heat) * 4.0 + 0.001) / 4.0;
    col = vec3(0.725, 0.722, 0.698) * (0.86 + 0.14 * step(0.3, fract(uStepT * 0.4 + aA.y * 0.0045 + aA.x * 0.0015)));
    a *= mix(step(0.5, fract(uStepT * 3.0 + rnd * 7.0)), 1.0, settle);
    vec3 mc = uMind[int(floor(fract(rnd * 7.31 + floor(uStepT * 1.5) * 0.37 * hs) * ${NM}.0))];
    col = mix(col, min(vec3(1.0), mc * 1.12), hs);
    size += floor(hs * uDpr * 0.8 + 0.5);
    if (beam) { col = vec3(1.0); size = floor(uMicro * 2.4 + 0.5); }
  }
  if (a <= 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
  float s = max(1.0, size);
  px = mod(s, 2.0) > 0.5 ? floor(px) + 0.5 : floor(px + 0.5);
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = s;
  vCol = vec4(col * a, a);
}`;
  const FS = `#version 300 es
precision mediump float;
in vec4 vCol;
out vec4 o;
void main() { o = vCol; }`;

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const prog = gl.createProgram()!;
  try {
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  } catch (e) {
    console.error(e);
    showAll();
    o.onStill?.();
    return () => {};
  }
  gl.useProgram(prog);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  ([[0, 3, 0], [1, 4, 3], [2, 2, 7]] as const).forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE * 4, off * 4);
  });
  const U: Record<string, WebGLUniformLocation | null> = {};
  ["uC", "uRes", "uMicro", "uStepT", "uIntro", "uDpr", "uScan", "uMind", "uHeat"].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
  gl.uniform3fv(U.uMind, new Float32Array(minds.length ? minds.flat() : [0.95, 0.95, 0.93]));
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const offs: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, fn: (e: never) => void, opt?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn as EventListener, opt);
    offs.push(() => t.removeEventListener(ev, fn as EventListener, opt));
  };

  /* the canvas covers the letters' box (with room for a key to sink) */
  let dpr = 1;
  let W = 1;
  let H = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = o.iiBox.getBoundingClientRect();
    W = Math.max(1, Math.round((r.width + 16) * dpr));
    H = Math.max(1, Math.round((r.height + 24) * dpr));
    o.canvas.width = W;
    o.canvas.height = H;
    gl!.viewport(0, 0, W, H);
  }
  on(window, "resize", resize);
  const ro = new ResizeObserver(resize);
  ro.observe(o.iiBox);
  offs.push(() => ro.disconnect());
  resize();

  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const st = {
    intro0: o.skipIntro ? -1e9 : performance.now(),
    touch: null as null | { col: number; row: number },
    scan0: -10,
    lastPoke: 0,
    wasIn: false,
    introScan: o.skipIntro,
    visible: true,
  };
  const io = new IntersectionObserver(([e]) => (st.visible = e.isIntersecting));
  io.observe(o.iiBox);
  offs.push(() => io.disconnect());

  /** where on the ii the pointer is, in bitmap cells (col 0–5, row 0–24); null off the letters */
  function iiCell(x: number, y: number) {
    const r = o.iiBox.getBoundingClientRect();
    if (!r.width || x < r.left - 12 || x > r.right + 12 || y < r.top - 12 || y > r.bottom + 12) return null;
    const u = ((x - r.left) / r.width) * 144 - 72;
    const v = ((y - r.top) / r.height) * 225;
    return { col: u < 0 ? u / 9 + 8 : u / 9 - 2, row: v / 9 };
  }
  const scan = () => {
    if (now() - st.scan0 > 1.1) st.scan0 = now();
  };
  on(window, "pointermove", (e: PointerEvent) => {
    const cell = iiCell(e.clientX, e.clientY);
    st.touch = cell;
    if (cell) st.lastPoke = now();
    if (cell && !st.wasIn) scan(); // entering the letters runs a copy pass
    st.wasIn = !!cell;
  }, { passive: true });
  const leave = () => {
    st.touch = null;
    st.wasIn = false;
  };
  on(document.documentElement, "pointerleave", leave);
  on(window, "pointerup", (e: PointerEvent) => e.pointerType !== "mouse" && leave());
  on(o.iiBox, "click", () => {
    st.scan0 = now();
    st.lastPoke = now();
  });

  /* heat per bitmap cell: the touch and the copy pass write it, it cools by itself */
  const heat = new Float32Array(152);
  function updateHeat(dt: number, t: number) {
    const k = Math.pow(0.18, dt);
    for (let i = 0; i < 150; i++) heat[i] *= k;
    const tc = st.touch;
    if (tc)
      for (let row = 0; row < ROWS; row++)
        for (let col = 0; col < COLS; col++) {
          const v = clamp(1.25 - Math.hypot(col + 0.5 - tc.col, row + 0.5 - tc.row) / 1.7);
          if (v > heat[row * 6 + col]) heat[row * 6 + col] = v;
        }
    if (st.scan0 < 0) return -1;
    const sr = Math.floor((t - st.scan0) * 34);
    if (sr > ROWS + 1) return -1;
    for (let col = 0; col < COLS; col++)
      for (const row of [sr - 1, sr]) if (row >= 0 && row < ROWS) heat[row * 6 + col] = Math.max(heat[row * 6 + col], 1);
    return sr;
  }

  let raf = 0;
  let last = performance.now();
  let introDone = o.skipIntro;
  if (o.skipIntro) showAll();
  function frame(ms: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (ms - last) / 1000));
    last = ms;
    const t = now();
    const it = (ms - st.intro0) / 1000;
    // intro: tiles set bottom → top, LEDs flicker on, then the words; one copy pass when it's done
    if (!introDone) {
      words.forEach((el, k) => dither(el, sstep(1.4 + k * 0.12, 1.85 + k * 0.12, it)));
      if (it > 1.85 + words.length * 0.12) introDone = true;
    }
    if (!st.introScan && it > 2.1) {
      st.introScan = true;
      st.scan0 = t;
    }
    if (!st.visible) return;
    if (t - Math.max(st.scan0, st.lastPoke) > 11) st.scan0 = t; // left alone a while, it runs another
    const scanRow = updateHeat(dt, t);
    const r = o.iiBox.getBoundingClientRect();
    gl!.uniform2f(U.uC, (8 + r.width / 2) * dpr, (12 + r.height / 2) * dpr);
    gl!.uniform2f(U.uRes, W, H);
    gl!.uniform1f(U.uMicro, (r.height / 225) * dpr);
    gl!.uniform1f(U.uStepT, Math.floor(t * 8) / 8);
    gl!.uniform1f(U.uIntro, it > 2.0 ? 2 : clamp((it - 0.3) / 1.3));
    gl!.uniform1f(U.uDpr, dpr);
    gl!.uniform1f(U.uScan, scanRow >= 0 ? scanRow : -1);
    gl!.uniform4fv(U.uHeat, heat);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.POINTS, 0, N);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    offs.forEach((f) => f());
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
  };
}
