/**
 * Draws the brain (brain-model.ts) as an LED pixel grid on a Canvas2D, the way
 * the reference picture looks: square cells with a hairline gap, lit from the
 * upper left, gyri bright, sulci dark, a z-buffer so the far side never shows
 * through. It's alive: spots fire now and then, and a slow pulse runs front to
 * back. Optionally the brain unfolds into a portrait (the PFP) and back.
 */
import { brainModel } from "./brain-model";
import { SIGNATURE_TILT } from "./signature";

export type PortraitCell = { x: number; y: number; r: number; g: number; b: number; a: number };
export type BrainFrame = {
  /** raw turn; side views get more screen time (see turnAngle) */
  angle: number;
  /** 0 = brain … 1 = portrait */
  reveal: number;
  /** true while unfolding into the portrait, false while folding back */
  opening: boolean;
  /** seconds */
  t: number;
  /** thinking / hover: livelier activity */
  active: boolean;
};

/** Cells across and their size, for a canvas of `size` css px: about 40 across, never under 1px. */
export function brainGrid(size: number) {
  const cell = Math.max(1, Math.round(size / 40));
  const N = Math.floor(size / cell);
  return { cell, N, off: (size - N * cell) / 2 };
}

/**
 * Turns faster past the front and back, slower past the profile, where the
 * brain is most recognisable: a = φ + 0.3·sin 2φ.
 */
export const turnAngle = (phi: number) => phi + 0.3 * Math.sin(2 * phi);

const hexRgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const L = (() => {
  const v = [-0.45, 0.6, 0.66];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
})();

export function createBrainRenderer(opts: { size: number; color: string; radius?: number; portrait?: PortraitCell[] }) {
  const { size, color, portrait } = opts;
  const { cell, N, off } = brainGrid(size);
  const R = size * (opts.radius ?? 0.36);
  const c = size / 2;
  const m = brainModel();
  const B = m.n;
  const [br, bg, bb] = hexRgb(color);
  const ct = Math.cos(SIGNATURE_TILT);
  const st = Math.sin(SIGNATURE_TILT);
  const gap = cell >= 3 ? 1 : 0;

  // each brain point keeps one portrait cell: brain rows top→bottom meet portrait rows top→bottom
  let target: Int32Array | null = null;
  if (portrait?.length) {
    target = new Int32Array(B);
    const byRow = Array.from({ length: B }, (_, i) => i).sort((a, b) => m.row[a] - m.row[b] || m.pos[a * 3 + 2] - m.pos[b * 3 + 2]);
    const cells = portrait.map((p, i) => i).sort((a, b) => portrait[a].y - portrait[b].y || portrait[a].x - portrait[b].x);
    byRow.forEach((pi, rank) => (target![pi] = cells[Math.min(cells.length - 1, Math.floor((rank * cells.length) / B))]));
  }

  const zbuf = new Float32Array(N * N);
  const win = new Int32Array(N * N);
  const winM = new Float32Array(N * N);
  const winZ = new Float32Array(N * N);
  const off2 = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (off2) off2.width = off2.height = N;
  const octx = off2?.getContext("2d") ?? null;
  const img = octx ? octx.createImageData(N, N) : null;

  function draw(ctx: CanvasRenderingContext2D, f: BrainFrame) {
    if (!octx || !img) return;
    const a = turnAngle(f.angle);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    zbuf.fill(-1e9);
    win.fill(-1);
    const reveal = target ? f.reveal : 0;

    for (let i = 0; i < B; i++) {
      const X = m.pos[i * 3];
      const Y = m.pos[i * 3 + 1];
      const Z = m.pos[i * 3 + 2];
      const x = ca * X + sa * Z;
      const z1 = -sa * X + ca * Z;
      const y = ct * Y - st * z1;
      const z = st * Y + ct * z1;
      let sx = c + x * R;
      let sy = c - y * R;
      let mm = 0;
      if (reveal > 0 && target) {
        const p = portrait![target[i]];
        const prow = p.y / N;
        const lead = f.opening ? prow : 1 - prow;
        mm = ease(Math.min(1, Math.max(0, (reveal - lead * 0.35) / 0.65)));
        if (mm > 0) {
          sx += (off + (p.x + 0.5) * cell - sx) * mm;
          sy += (off + (p.y + 0.5) * cell - sy) * mm;
        }
      }
      const gx = Math.floor((sx - off) / cell);
      const gy = Math.floor((sy - off) / cell);
      if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue;
      const k = gy * N + gx;
      const depth = z + mm * 4;
      if (depth > zbuf[k]) {
        zbuf[k] = depth;
        win[k] = i;
        winM[k] = mm;
        winZ[k] = z;
      }
    }

    const d = img.data;
    const t = f.t;
    const spark = f.active ? 1.6 : 1;
    // a slow pulse front → back, every ~4s (faster while thinking)
    const wave = (((t * (f.active ? 0.8 : 0.4)) % 1.6) - 0.3) * 2 - 1;
    for (let k = 0; k < N * N; k++) {
      const i = win[k];
      const o = k * 4;
      if (i < 0) {
        d[o + 3] = 0;
        continue;
      }
      const mm = winM[k];
      const z = winZ[k];
      const nX = m.nrm[i * 3];
      const nY = m.nrm[i * 3 + 1];
      const nZ = m.nrm[i * 3 + 2];
      const nx = ca * nX + sa * nZ;
      const nz1 = -sa * nX + ca * nZ;
      const ny = ct * nY - st * nz1;
      const nz = st * nY + ct * nz1;
      const sun = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      let v = (0.26 + 0.74 * sun) * (0.42 + 0.78 * m.fold[i]) * (0.62 + 0.38 * (z * 0.5 + 0.5));
      // activity: a spot fires now and then, and the pulse passes by
      const s = m.seed[i];
      const fire = Math.max(0, Math.sin(t * (0.9 + s * 1.3) * spark + s * 61.7)) ** 40;
      const pulse = Math.exp(-(((m.pos[i * 3 + 2] - wave) / 0.14) ** 2));
      v *= 1.32 * (1 + 0.95 * fire + 0.32 * pulse);
      let r = br;
      let g = bg;
      let b = bb;
      let pa = 1;
      if (target) {
        // as a brain: the brain's color, with a hint of the PFP's
        const p = portrait![target[i]];
        r = p.r * 0.14 + br * 0.86;
        g = p.g * 0.14 + bg * 0.86;
        b = p.b * 0.14 + bb * 0.86;
        pa = p.a;
      }
      const hot = Math.max(0, v - 1) * 0.55 * 255;
      const lit = Math.min(1, v);
      r = r * lit + hot;
      g = g * lit + hot;
      b = b * lit + hot;
      if (mm > 0) {
        const p = portrait![target![i]];
        r += (p.r - r) * mm;
        g += (p.g - g) * mm;
        b += (p.b - b) * mm;
      }
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255 * (mm > 0 ? (1 - mm) + mm * pa : 1);
    }
    octx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off2!, off, off, N * cell, N * cell);
    if (gap) {
      // the LED grid: a hairline between cells
      ctx.globalCompositeOperation = "destination-out";
      for (let q = 1; q <= N; q++) {
        ctx.fillRect(off + q * cell - gap, 0, gap, size);
        ctx.fillRect(0, off + q * cell - gap, size, gap);
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  return { draw, N, cell };
}
