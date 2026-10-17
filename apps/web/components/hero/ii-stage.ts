/**
 * The home stage, in one WebGL2 layer over the page:
 *
 *  - the "ii" at rest: ceramic tiles (the human) and LED points (the AI). Both
 *    letters answer the same touch: keys sink under the pointer on one, the
 *    matching LEDs light up in the minds' colors on the other. Now and then a
 *    copy pass scans down both, row by row.
 *  - on scroll the tiles crack into 9×9 squares, the ii turns into one colored
 *    band per card, and each band flies to its card as one stream, folding into
 *    the shape of that card's pixel brain on the way. When a band lands, the
 *    card's own brain (the same renderer, the same frame) takes over.
 *
 * Everything that reads (headline, card copy) dithers in and out with the same
 * stepped 4×4 Bayer pattern, so text and squares move as one system.
 */
import { createBrainRenderer, portraitCells } from "@/lib/brain-render";
import { COLS, I_BITMAP, ROWS } from "@/lib/logo-geometry";

export type StageCard = { color: string; avatar?: string; add?: boolean };

type Opts = {
  canvas: HTMLCanvasElement;
  root: HTMLElement;
  iiBox: HTMLElement;
  grid: HTMLElement;
  slots: HTMLElement[];
  cardEls: HTMLElement[];
  cards: StageCard[];
  /** client-side return to "/": no intro */
  skipIntro: boolean;
  /** reduced motion: everything shown at rest, nothing flies */
  still: boolean;
  /** called when the stage falls back to still (no WebGL2): the page draws the static mark */
  onStill?: () => void;
};

const MICRO = 9; // squares per tile edge
const PITCH = 10; // columns between the letters' centers
const MAX_STREAMS = 16;
const ADD_RGB = [150, 149, 144] as const;
const SPIN = 7.5;
const MORPH = 1.1;
const HOLD = 1.6;
const CYCLE = SPIN + MORPH + HOLD + MORPH;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
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

/* ── column-major 4×4 matrices ── */
type Mat = Float32Array;
const mId = (): Mat => {
  const o = new Float32Array(16);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
};
const mMul = (a: Mat, b: Mat): Mat => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const mPersp = (fovy: number, asp: number, n: number, f: number): Mat => {
  const t = 1 / Math.tan(fovy / 2);
  const o = new Float32Array(16);
  o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f);
  return o;
};
const mTr = (x: number, y: number, z: number) => { const o = mId(); o[12] = x; o[13] = y; o[14] = z; return o; };
const mSc = (s: number) => { const o = mId(); o[0] = o[5] = o[10] = s; return o; };

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
  el.querySelectorAll<HTMLElement>("a,button").forEach((a) => (a.tabIndex = lvl <= 0 ? -1 : 0));
}

/* ── the card brains ── */
type CardState = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  r: ReturnType<typeof createBrainRenderer> | null;
  size: number;
  dpr: number;
  rgb: [number, number, number];
  add: boolean;
  image: HTMLImageElement | null;
  angle: number;
  phase: number;
  hover: boolean;
  landed: boolean;
  start: number;
  count: number;
};

export function startIiStage(o: Opts): () => void {
  const reduce = o.still;
  const D: Record<string, HTMLElement> = {};
  o.root.querySelectorAll<HTMLElement>("[data-d]").forEach((el) => (D[el.dataset.d!] = el));
  const CARDS = o.cards.length;
  const cardText = Array.from({ length: CARDS }, (_, i) => Array.from(o.root.querySelectorAll<HTMLElement>(`[data-c="${i}"]`)));
  const minds = o.cards.filter((c) => !c.add).map((c) => hexRgb(c.color));

  const cards: CardState[] = o.slots.map((el, k) => ({
    canvas: el.querySelector("canvas")!,
    ctx: null,
    r: null,
    size: 0,
    dpr: 0,
    rgb: o.cards[k].add ? [...ADD_RGB] : hexRgb(o.cards[k].color),
    add: !!o.cards[k].add,
    image: null,
    angle: 0.9 + k * 0.37,
    phase: (k * 1.7) % (SPIN * 0.7),
    hover: false,
    landed: false,
    start: 0,
    count: 0,
  }));
  const offs: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, fn: (e: never) => void, opt?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn as EventListener, opt);
    offs.push(() => t.removeEventListener(ev, fn as EventListener, opt));
  };
  o.cardEls.forEach((el, k) => {
    const enter = () => (cards[k].hover = true);
    const leave = () => (cards[k].hover = false);
    on(el, "pointerenter", enter);
    on(el, "pointerleave", leave);
    on(el, "focus", enter);
    on(el, "blur", leave);
  });

  const cardRgb = (k: number, t: number): readonly [number, number, number] => {
    const c = cards[k];
    if (!c.add || !c.hover || !minds.length) return c.rgb;
    return minds[Math.floor(t * 3) % minds.length]; // any mind: it cycles through all of them
  };
  function setupCard(k: number) {
    const c = cards[k];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = o.slots[k].clientWidth || 80;
    c.size = size;
    c.dpr = dpr;
    c.canvas.width = Math.round(size * dpr);
    c.canvas.height = Math.round(size * dpr);
    c.ctx = c.canvas.getContext("2d");
    c.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const N = Math.floor(size / Math.max(1, Math.round(size / 40)));
    const portrait = c.image ? portraitCells(c.image, N) : undefined;
    c.r = createBrainRenderer({ size, color: o.cards[k].color, radius: 0.42, portrait });
  }
  function stampPlus(k: number) {
    const r = cards[k].r!;
    const { N, img } = r;
    if (!img) return;
    const d = img.data;
    const cx = Math.round(N * 0.5), cy = Math.round(N * 0.47), arm = Math.round(N * 0.17), th = Math.max(1, Math.round(N * 0.045));
    for (let y = cy - arm - 1; y <= cy + arm + 1; y++)
      for (let x = cx - arm - 1; x <= cx + arm + 1; x++) {
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const bar = (Math.abs(x - cx) <= th && Math.abs(y - cy) <= arm) || (Math.abs(y - cy) <= th && Math.abs(x - cx) <= arm);
        const ring = !bar && ((Math.abs(x - cx) <= th + 1 && Math.abs(y - cy) <= arm + 1) || (Math.abs(y - cy) <= th + 1 && Math.abs(x - cx) <= arm + 1));
        const p = (y * N + x) * 4;
        if (bar) { d[p] = 242; d[p + 1] = 241; d[p + 2] = 236; d[p + 3] = 255; }
        else if (ring) { d[p] = 5; d[p + 1] = 5; d[p + 2] = 6; d[p + 3] = 255; }
      }
  }
  function drawCard(k: number, t: number) {
    const c = cards[k];
    if (!c.r) return;
    const ph = c.phase;
    let reveal = 0;
    if (ph > SPIN && ph < SPIN + MORPH) reveal = (ph - SPIN) / MORPH;
    else if (ph >= SPIN + MORPH && ph < SPIN + MORPH + HOLD) reveal = 1;
    else if (ph >= SPIN + MORPH + HOLD) reveal = 1 - (ph - SPIN - MORPH - HOLD) / MORPH;
    c.r.render({ angle: c.angle, reveal, opening: ph < SPIN + MORPH + HOLD, t, active: c.hover, rgb: cardRgb(k, t) });
    if (c.add) stampPlus(k);
  }
  const showCanvas = (c: CardState, v: boolean) => (c.canvas.style.visibility = v ? "visible" : "hidden");

  // PFPs: the brains are built from them (and unfold into them)
  let disposed = false;
  let onImage: (k: number) => void = () => {};
  cards.forEach((c, k) => {
    setupCard(k);
    const src = o.cards[k].avatar;
    if (!src) return;
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      if (disposed) return;
      c.image = im;
      setupCard(k);
      onImage(k);
    };
    im.src = src;
  });

  /* ── still: no WebGL or reduced motion ── */
  let raf = 0;
  const gl = o.still ? null : o.canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  const goStill = () => {
    Object.values(D).forEach((el) => dither(el, 1));
    cardText.flat().forEach((el) => dither(el, 1));
    cards.forEach((c, k) => {
      c.landed = true;
      showCanvas(c, true);
      c.angle = Math.PI / 2;
      c.phase = 0;
      drawCard(k, 0);
      c.r?.blit(c.ctx!);
    });
    onImage = (k) => {
      drawCard(k, 0);
      cards[k].r?.blit(cards[k].ctx!);
    };
    o.onStill?.();
    return () => {
      disposed = true;
      offs.forEach((f) => f());
    };
  };
  if (!gl) return goStill();

  /* ── geometry. per square: aA position (3), aD kind/rnd/thr/aux (4), aT card or cell data (4), aC target color (3) ── */
  const STRIDE = 14;
  const R = rng(20261017);
  const G = () => {
    let u = 0;
    while (!u) u = R();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R());
  };
  const pts: number[][] = [];
  type Micro = { x: number; y: number; kind: number; tileThr: number; thr: number };
  const micro: Micro[] = [];
  const tileRank = (row: number) => (row <= 5 ? (5 - row) / 5 : (ROWS - 1 - row) / (ROWS - 1 - 7));
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      if (!filled(row, col)) continue;
      for (const letter of [0, 1]) {
        const off = letter === 0 ? -PITCH / 2 : PITCH / 2;
        const x0 = (off + col - COLS / 2) * MICRO;
        const y0 = (ROWS / 2 - row - 1) * MICRO;
        const tileThr = clamp(0.4 * (row / ROWS) + 0.07 * bayer(col + letter * 3, row) + (letter ? 0.02 : 0) + R() * 0.02, 0, 0.5);
        const rank = tileRank(row) * 0.8;
        if (letter === 0) pts.push([x0 + 4, y0 + 5, 0, 5, R(), tileThr, rank, col, row, 0, 0, 0, 0, 0]);
        else
          for (let ly = 0; ly < 3; ly++)
            for (let lx = 0; lx < 3; lx++) pts.push([x0 + lx * 3 + 1, y0 + (MICRO - 1 - ly * 3), 0, 6, R(), tileThr, rank * 0.7 + R() * 0.3, col, row, 1, 0, 0, 0, 0]);
        for (let my = 0; my < MICRO; my++)
          for (let mx = 0; mx < MICRO; mx++) {
            const lit = letter === 0 ? mx < 8 && my < 8 : mx % 3 < 2 && my % 3 < 2;
            if (lit) micro.push({ x: x0 + mx + 0.5, y: y0 + (MICRO - 1 - my) + 0.5, kind: letter === 0 ? 2 : 3, tileThr, thr: tileThr + 0.02 + R() * 0.08 });
          }
      }
    }
  // one band of the ii per streamed card, top → bottom; inside a band, left → right, like the brain's cells
  const NC = Math.min(CARDS, MAX_STREAMS);
  const order = micro.map((_, i) => i).sort((a, b) => micro[b].y + G() * 6 - (micro[a].y + G() * 6));
  const per = Math.floor(order.length / NC);
  const cardThr = new Array(CARDS).fill(0);
  for (let k = 0; k < NC; k++) {
    const band = order.slice(k * per, k === NC - 1 ? order.length : (k + 1) * per).sort((a, b) => micro[a].x - micro[b].x);
    cards[k].start = pts.length;
    cards[k].count = band.length;
    for (const idx of band) {
      const m = micro[idx];
      cardThr[k] = Math.max(cardThr[k], m.thr);
      pts.push([m.x, m.y, 0, m.kind, R(), m.thr, m.tileThr, k, 0, 0, 0, 1, 1, 1]);
    }
  }
  const lastThr = Math.max(...cardThr.slice(0, NC));
  for (let k = NC; k < CARDS; k++) cardThr[k] = lastThr; // cards past the streams appear with the last one
  const landS = cardThr.map((th) => (th + 0.75) / 1.6);
  const bandC = new Float32Array(NC * 2);
  for (let k = 0; k < NC; k++) {
    let sx = 0, sy = 0;
    for (let j = 0; j < cards[k].count; j++) {
      const p = pts[cards[k].start + j];
      sx += p[0];
      sy += p[1];
    }
    bandC[k * 2] = sx / cards[k].count;
    bandC[k * 2 + 1] = sy / cards[k].count;
  }
  const N = pts.length;
  const buf = new Float32Array(N * STRIDE);
  pts.forEach((p, i) => buf.set(p, i * STRIDE));
  const NL = Math.ceil(NC / 4);

  const VS = `#version 300 es
precision highp float;
#define NC ${NC}
#define NL ${NL}
layout(location=0) in vec3 aA;
layout(location=1) in vec4 aD;
layout(location=2) in vec4 aT;
layout(location=3) in vec3 aC;
uniform mat4 uProj, uIi;
uniform float uStepT, uS, uIntroII, uDpr, uMicroPx, uIiDist, uScan, uSlotPx;
uniform vec2 uRes;
uniform vec3 uMouse;
uniform vec2 uSlot[NC];
uniform vec2 uBandC[NC];
uniform vec3 uBC[NC];
uniform vec3 uMind[12];
uniform float uMinds;
uniform vec4 uLand[NL];
uniform vec4 uHeat[38];
out vec4 vCol;

float ease(float x) { return x * x * (3.0 - 2.0 * x); }
vec2 toPx(vec4 clip) { return (clip.xy / clip.w * 0.5 + 0.5) * uRes; }

void main() {
  float kind = aD.x, rnd = aD.y, thr = aD.z, aux = aD.w;
  vec3 col = vec3(0.949, 0.945, 0.925);
  float a = 1.0, size = 1.0;
  bool flying = false;
  vec2 px;
  bool hidden = false;

  if (kind > 4.5) {
    /* at rest: ceramic keys (left) and LEDs (right), both answering the same touch */
    vec4 iv = uIi * vec4(aA, 1.0);
    float persp = uIiDist / max(0.1, -iv.z);
    size = floor(uMicroPx * persp * (kind < 5.5 ? 8.0 : 2.4) + 0.5);
    px = toPx(uProj * iv);
    float on = step(aux, uIntroII);
    float settle = clamp((uIntroII - aux) * 8.0, 0.0, 1.0);
    px.y += (1.0 - settle) * 10.0 * uDpr;
    a = on * (1.0 - step(0.0001, uS * 1.6 - thr));
    int idx = int(aT.y) * 6 + int(aT.x);
    float heat = uHeat[idx / 4][idx % 4];
    bool beam = uScan > -0.5 && abs(aT.y + 0.5 - uScan) < 0.75;
    if (kind < 5.5) {
      // the key sinks under the finger, a step at a time, and rises back
      float hs = floor(heat * heat * 4.0 + 0.001) / 4.0;
      col *= 1.0 - 0.5 * hs;
      size = max(1.0, size - floor(hs * size * 0.28 + 0.5));
      px += vec2(1.0, -1.0) * floor(hs * 2.0 * uDpr + 0.5);
      if (beam) col *= 0.55;
    } else {
      // the LED lights up in a mind's color and fades slowly
      float hs = floor(sqrt(heat) * 4.0 + 0.001) / 4.0;
      col = vec3(0.725, 0.722, 0.698);
      col *= 0.86 + 0.14 * step(0.3, fract(uStepT * 0.4 - aA.y * 0.0045 + aA.x * 0.0015));
      a *= mix(step(0.5, fract(uStepT * 3.0 + rnd * 7.0)), 1.0, settle);
      vec3 mc = uMind[int(floor(fract(rnd * 7.31 + floor(uStepT * 1.5) * 0.37 * hs) * uMinds))];
      col = mix(col, min(vec3(1.0), mc * 1.12), hs);
      size += floor(hs * uDpr * 0.8 + 0.5);
      if (beam) { col = vec3(1.0); size = floor(uMicroPx * persp * 2.4 + 0.5); }
    }
  } else {
    /* a square: hidden inside its tile until the tile cracks, then off to its brain */
    flying = true;
    vec4 iv = uIi * vec4(aA, 1.0);
    vec2 p0 = toPx(uProj * iv);
    float persp = uIiDist / max(0.1, -iv.z);
    float rest = ceil(uMicroPx * persp + 0.15);
    if (uS * 1.6 - aux <= 0.0001) hidden = true;
    float lp = clamp((uS * 1.6 - thr) / 0.75, 0.0, 1.0);
    float q = floor(lp * 16.0) / 16.0;
    int ci = int(aT.x);
    vec3 mind = uBC[ci];
    vec2 bandC = toPx(uProj * (uIi * vec4(uBandC[ci], 0.0, 1.0)));
    vec2 slotC = uSlot[ci] + vec2(0.5, -0.5) * uSlotPx;
    vec2 tgt = vec2(uSlot[ci].x + aT.y * uDpr, uSlot[ci].y - aT.z * uDpr);
    float tsize = aT.w * uDpr;
    vec2 startOff = p0 - bandC;
    // 1. the tile cracks: squares step apart and take their mind's color; the ii becomes one colored band per card
    float A = 0.2;
    vec2 popDir = normalize(startOff + vec2((rnd - 0.5) * 6.0, (fract(rnd * 17.0) - 0.5) * 6.0) * uDpr + vec2(0.001));
    vec2 pop = popDir * (6.0 + fract(rnd * 29.0) * 16.0) * uDpr;
    float pa = clamp(q / A, 0.0, 1.0);
    float u = 0.0;
    if (q <= A) {
      px = p0 + pop * ease(pa);
      size = rest;
      col = mix(kind > 2.5 ? vec3(0.725, 0.722, 0.698) : col, mind, floor(pa * 4.0) / 4.0);
    } else {
      // 2. each band flies to its own brain as one ribbon, squares leaving in order across it, and folds into the brain on the way
      float delay = clamp(aT.y * uDpr / max(1.0, uSlotPx), 0.0, 1.0) * 0.1 + fract(rnd * 7.13) * 0.03;
      u = clamp(((q - A) / (1.0 - A) - delay) / 0.87, 0.0, 1.0);
      float e = ease(u);
      vec2 b0 = bandC, b2 = slotC;
      vec2 b1 = vec2(mix(b0.x, b2.x, 0.92), mix(b0.y, b2.y, 0.18));
      vec2 g = mix(mix(b0, b1, e), mix(b1, b2, e), e);
      vec2 off = mix(startOff + pop, tgt - slotC, ease(clamp(u * 1.25 - 0.1, 0.0, 1.0)));
      px = g + off;
      size = floor(mix(rest, max(tsize, 1.0), e) + 0.5);
      // on arrival the flat color becomes the brain's own shading
      col = mix(mind, aC, floor(clamp((u - 0.7) / 0.3, 0.0, 1.0) * 3.0) / 3.0);
      if (tsize < 0.5) a = 1.0 - smoothstep(0.55, 0.95, u);
    }
    if (uLand[ci / 4][ci % 4] > 0.5) hidden = true; // the card's own brain has taken over
    if (lp > 0.0 && lp < 0.06) { col = vec3(1.0); a *= step(0.5, fract(uStepT * 2.0 + rnd * 9.0)); }
    if (u >= 1.0) flying = false;
  }

  if (hidden || a <= 0.003 || size < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return;
  }
  if (flying) {
    // squares in flight lean away from the pointer
    vec2 d = px - uMouse.xy;
    float dl = length(d);
    float f = uMouse.z * (1.0 - smoothstep(0.0, 115.0 * uDpr, dl));
    px += (dl > 0.001 ? d / dl : vec2(0.0)) * f * f * 14.0 * uDpr;
  }
  float s = max(1.0, floor(size + 0.5));
  px = mod(s, 2.0) > 0.5 ? floor(px) + 0.5 : floor(px + 0.5);
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = s;
  a = clamp(a, 0.0, 1.0);
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
    return goStill();
  }
  gl.useProgram(prog);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
  ([[0, 3, 0], [1, 4, 3], [2, 4, 7], [3, 3, 11]] as const).forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE * 4, off * 4);
  });
  const U: Record<string, WebGLUniformLocation | null> = {};
  ["uProj", "uIi", "uStepT", "uS", "uIntroII", "uDpr", "uMicroPx", "uIiDist", "uScan", "uSlotPx", "uRes", "uMouse", "uSlot", "uBandC", "uBC", "uMind", "uMinds", "uLand", "uHeat"].forEach(
    (n) => (U[n] = gl.getUniformLocation(prog, n)),
  );
  gl.uniform3fv(U.uBC, new Float32Array(cards.slice(0, NC).flatMap((c) => (c.add ? [0.95, 0.95, 0.93] : c.rgb.map((v) => v / 255)))));
  const mindU = new Float32Array(36);
  minds.slice(0, 12).forEach((m, i) => mindU.set(m.map((v) => v / 255), i * 3));
  gl.uniform3fv(U.uMind, mindU);
  gl.uniform1f(U.uMinds, Math.max(1, Math.min(12, minds.length)));
  gl.uniform2fv(U.uBandC, bandC);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  /* point card k's squares at its brain's current frame */
  function aimCard(k: number, t: number) {
    if (k >= NC) return;
    const c = cards[k];
    if (!c.r?.img) return;
    c.phase = Math.min(c.phase, SPIN * 0.7); // land as a brain, not mid-portrait
    drawCard(k, t);
    const { img, N: n, cell, off } = c.r;
    const d = img!.data;
    const cells: number[][] = [];
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++) {
        const p = (y * n + x) * 4;
        if (d[p + 3] < 40) continue;
        cells.push([off + (x + 0.5) * cell, off + (y + 0.5) * cell, cell, Math.min(255, d[p]) / 255, Math.min(255, d[p + 1]) / 255, Math.min(255, d[p + 2]) / 255]);
      }
    for (let j = 0; j < c.count; j++) {
      const b = (c.start + j) * STRIDE;
      const ix = Math.floor((j * cells.length) / c.count);
      const cl = cells[ix];
      // more squares than cells: each cell gets one, the rest fade out on the way
      const own = cl && ix !== Math.floor(((j - 1) * cells.length) / c.count);
      buf[b + 8] = cl ? cl[0] : 0;
      buf[b + 9] = cl ? cl[1] : 0;
      buf[b + 10] = own ? cl[2] : 0;
      buf[b + 11] = own ? cl[3] : 1;
      buf[b + 12] = own ? cl[4] : 1;
      buf[b + 13] = own ? cl[5] : 1;
    }
    gl!.bindBuffer(gl!.ARRAY_BUFFER, vbo);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, c.start * STRIDE * 4, buf, c.start * STRIDE, c.count * STRIDE);
  }

  /* ── state ── */
  const FOV = (42 * Math.PI) / 180;
  const II_DIST = 10;
  let Wd = 1, Hd = 1, dpr = 1;
  let proj = mId();
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const st = {
    intro0: o.skipIntro ? -1e9 : performance.now(),
    ss: 0,
    mouse: [-9999, -9999],
    mouseOn: 0,
    mouseS: 0,
    touch: null as null | { col: number; row: number },
    scan0: -10,
    lastPoke: 0,
    wasIn: false,
    introScan: o.skipIntro,
  };
  onImage = (k) => { if (!cards[k].landed) aimCard(k, now()); };

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    Wd = window.innerWidth;
    Hd = window.innerHeight;
    o.canvas.width = Math.round(Wd * dpr);
    o.canvas.height = Math.round(Hd * dpr);
    gl!.viewport(0, 0, o.canvas.width, o.canvas.height);
    proj = mPersp(FOV, Wd / Hd, 0.1, 200);
    cards.forEach((c, k) => {
      if (c.size === (o.slots[k].clientWidth || 80) && c.dpr === dpr) return;
      setupCard(k);
      if (!c.landed) aimCard(k, now());
    });
  }
  on(window, "resize", resize);
  resize();
  cards.forEach((_, k) => aimCard(k, 0));

  /** scroll position where the last band has landed: the cards near the top, or the end of the page if that comes first */
  const landing = () => {
    const g = o.grid.getBoundingClientRect().top + window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight - 2;
    return Math.max(200, Math.min(max, g - Hd * 0.22));
  };

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
    st.mouse = [e.clientX, e.clientY];
    st.mouseOn = e.pointerType === "mouse" ? 1 : 0.6;
    const cell = window.scrollY < 40 ? iiCell(e.clientX, e.clientY) : null;
    st.touch = cell;
    if (cell) st.lastPoke = now();
    if (cell && !st.wasIn) scan(); // entering the letters runs a copy pass
    st.wasIn = !!cell;
  }, { passive: true });
  on(document.documentElement, "pointerleave", () => {
    st.mouseOn = 0;
    st.touch = null;
    st.wasIn = false;
  });
  on(window, "pointerup", (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    st.mouseOn = 0;
    st.touch = null;
    st.wasIn = false;
  });
  on(window, "click", (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest?.("a,button") || window.scrollY >= 40 || !iiCell(e.clientX, e.clientY)) return;
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

  /* ── frame ── */
  let last = performance.now();
  const slotU = new Float32Array(NC * 2);
  const landU = new Float32Array(NL * 4);
  let drewEmpty = false;
  function frame(ms: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (ms - last) / 1000));
    last = ms;
    const t = now();
    const it = (ms - st.intro0) / 1000;

    const s = clamp(window.scrollY / landing());
    st.ss += (s - st.ss) * Math.min(1, dt * 12);
    const S = Math.abs(s - st.ss) < 0.0005 ? s : st.ss;

    // intro: tiles set bottom → top, LEDs flicker on, then the words; one copy pass when it's done
    const introII = it > 2.0 ? 2 : clamp((it - 0.3) / 1.3);
    const introText = (k: number) => sstep(1.4 + k * 0.12, 1.85 + k * 0.12, it);
    if (!st.introScan && it > 2.1) {
      st.introScan = true;
      st.scan0 = t;
    }
    // left alone a while, it runs another
    if (S < 0.02 && t - Math.max(st.scan0, st.lastPoke) > 11) st.scan0 = t;
    st.mouseS += (st.mouseOn - st.mouseS) * Math.min(1, dt * 6);

    const asp = Wd / Hd;
    const r = o.iiBox.getBoundingClientRect();
    const halfH = Math.tan(FOV / 2) * II_DIST;
    const microW = ((r.height / 225) * (2 * halfH)) / Hd;
    // the letters trail the page at half speed while they break, so they stay on screen
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2 + Math.min(window.scrollY, Hd) * 0.5;
    const iiM = mMul(mTr(((cx / Wd) * 2 - 1) * halfH * asp, (1 - (cy / Hd) * 2) * halfH, -II_DIST), mSc(microW));
    const scanRow = updateHeat(dt, t);

    // cards: where the brains sit, whether their squares have arrived, and the brains themselves
    let flying = false;
    cards.forEach((c, i) => {
      const b = o.slots[i].getBoundingClientRect();
      if (i < NC) {
        slotU[i * 2] = b.left * dpr;
        slotU[i * 2 + 1] = (Hd - b.top) * dpr;
      }
      const landed = S >= landS[i] - 0.0005;
      if (landed !== c.landed) {
        c.landed = landed;
        showCanvas(c, landed);
        if (!landed) aimCard(i, t); // the squares fly back out of the brain as it is right now
      }
      if (i < NC) landU[i] = landed ? 1 : 0;
      if (!landed) flying = true;
      if (landed && b.bottom > -40 && b.top < Hd + 40 && c.ctx && c.r) {
        c.angle += dt * (c.hover ? 1.5 : 0.5);
        c.phase = (c.phase + dt) % CYCLE;
        if (c.hover && c.phase > SPIN) c.phase = SPIN - 0.01;
        if (c.add) c.phase = Math.min(c.phase, SPIN * 0.7);
        drawCard(i, t);
        c.r.blit(c.ctx);
      }
    });

    const out = (a: number, b: number) => 1 - sstep(a, b, S);
    if (D.l1) dither(D.l1, Math.min(introText(0), out(0.03, 0.12)));
    if (D.l2) dither(D.l2, Math.min(introText(1), out(0.05, 0.14)));
    if (D.lead) dither(D.lead, Math.min(introText(2), out(0.07, 0.16)));
    if (D.cta) dither(D.cta, Math.min(introText(3), out(0.09, 0.18)));
    if (D.cue) dither(D.cue, Math.min(introText(4), out(0.0, 0.05)));
    if (D.head) dither(D.head, sstep(0.45, 0.6, S));
    cardText.forEach((els, k) => els.forEach((el, j) => dither(el, sstep(landS[k] - 0.06 + j * 0.03, landS[k] + j * 0.03, S))));

    // nothing left in the air: one empty frame, then the canvas rests
    if (!flying && S >= 0.999) {
      if (!drewEmpty) {
        gl!.clearColor(0, 0, 0, 0);
        gl!.clear(gl!.COLOR_BUFFER_BIT);
        drewEmpty = true;
      }
      return;
    }
    drewEmpty = false;

    gl!.uniformMatrix4fv(U.uProj, false, proj);
    gl!.uniformMatrix4fv(U.uIi, false, iiM);
    gl!.uniform1f(U.uStepT, Math.floor(t * 8) / 8);
    gl!.uniform1f(U.uS, S);
    gl!.uniform1f(U.uIntroII, introII);
    gl!.uniform1f(U.uDpr, dpr);
    gl!.uniform1f(U.uMicroPx, (r.height / 225) * dpr);
    gl!.uniform1f(U.uIiDist, II_DIST);
    gl!.uniform1f(U.uScan, scanRow >= 0 ? scanRow : -1);
    gl!.uniform1f(U.uSlotPx, (o.slots[0]?.clientWidth || 80) * dpr);
    gl!.uniform2f(U.uRes, o.canvas.width, o.canvas.height);
    gl!.uniform3f(U.uMouse, st.mouse[0] * dpr, (Hd - st.mouse[1]) * dpr, st.mouseS);
    gl!.uniform2fv(U.uSlot, slotU);
    gl!.uniform4fv(U.uLand, landU);
    gl!.uniform4fv(U.uHeat, heat);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.POINTS, 0, N);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    offs.forEach((f) => f());
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
  };
}
