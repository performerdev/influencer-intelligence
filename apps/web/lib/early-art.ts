/**
 * Drawing for Early Mind: the ii mark as a ticker ($ii — both letters solid,
 * a stick and a dot), and the $ii coin, ray-cast onto the same LED grid as
 * the pixel brains: a ceramic disc with the ii mark on both faces and a reeded
 * edge, lit from the upper left like the brains.
 */
import { I_BITMAP } from "@/lib/logo-geometry";

const CELLS = I_BITMAP.flatMap((line, y) => [...line].flatMap((ch, x) => (ch === "#" ? [{ x, y }] : [])));
const W = 16; // two letters 10 columns apart
const H = I_BITMAP.length; // 25

/** SVG path of "ii" (both solid) in a 16×25 box. */
export const II_PATH = CELLS.map(({ x, y }) => `M${x} ${y}h1v1h-1zM${x + 10} ${y}h1v1h-1z`).join("");
export const II_RATIO = W / H;

/** "ii" on a canvas, standing on `base`, `h` tall. Returns its width. */
export function drawII(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, color: string) {
  const c = h / H;
  ctx.fillStyle = color;
  for (const p of CELLS) {
    ctx.fillRect(x + p.x * c, base - h + p.y * c, c + 0.03, c + 0.03);
    ctx.fillRect(x + (p.x + 10) * c, base - h + p.y * c, c + 0.03, c + 0.03);
  }
  return W * c;
}

/** The brand logo (solid i, dithered i) on a canvas, top-left at x, y, `c` px per cell. */
export function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, c: number) {
  ctx.fillStyle = "#f2f1ec";
  for (const p of CELLS) ctx.fillRect(x + p.x * c, y + p.y * c, c, c);
  ctx.fillStyle = "#b9b8b2";
  for (const p of CELLS) if ((p.x + p.y) % 2 === 0) ctx.fillRect(x + (p.x + 10) * c, y + p.y * c, c, c);
}

/* ───────────────────────── the coin ───────────────────────── */

const LV = (() => {
  const v = [-0.45, 0.6, 0.66];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
})();
const HV = (() => {
  const h = [LV[0], LV[1], LV[2] + 1];
  const l = Math.hypot(...h);
  return h.map((x) => x / l);
})();
const LOGO = (() => {
  const g = new Uint8Array(W * H);
  for (const p of CELLS) {
    g[p.y * W + p.x] = 1;
    g[p.y * W + p.x + 10] = 2;
  }
  return g;
})();

export type CoinRenderer = { draw: (theta: number, dim: number) => void; canvas: HTMLCanvasElement };

/**
 * A coin `px` device pixels square, ~40 cells across. `theta` turns it about
 * the vertical axis (0 = face on); `dim` 0.42 (locked) … 1 (lit).
 */
export function createCoin(px: number): CoinRenderer {
  const cell = Math.max(1, Math.round(px / 40));
  const N = Math.floor(px / cell);
  const off = Math.floor((px - N * cell) / 2);
  const gap = cell >= 4 ? Math.max(1, Math.round(cell / 4)) : 0; // the LED grid only when cells are big enough to read
  const R = 0.84;
  const T = 0.17;
  const RIM = 0.86;
  const LS = 0.046;
  const low = document.createElement("canvas");
  low.width = low.height = N;
  const lctx = low.getContext("2d")!;
  const img = lctx.createImageData(N, N);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const octx = canvas.getContext("2d")!;
  const logoAt = (u: number, v: number) => {
    const col = Math.floor((u + (W / 2) * LS) / LS);
    const row = Math.floor(((H / 2) * LS - v) / LS);
    return col < 0 || row < 0 || col >= W || row >= H ? 0 : LOGO[row * W + col];
  };

  function draw(theta: number, dim: number) {
    const ct = Math.cos(theta);
    const sn = Math.sin(theta);
    const d = img.data;
    for (let gy = 0; gy < N; gy++)
      for (let gx = 0; gx < N; gx++) {
        const x = ((gx + 0.5) / N) * 2 - 1;
        const y = 1 - ((gy + 0.5) / N) * 2;
        const o = (gy * N + gx) * 4;
        let best = -1e9;
        let nx = 0;
        let ny = 0;
        let nz = 0;
        let kind = 0;
        let u = 0;
        if (Math.abs(ct) > 1e-4)
          for (const sg of [1, -1]) {
            const tt = ((sg * T) / 2 - x * sn) / ct;
            const xl = x * ct - tt * sn;
            if (xl * xl + y * y <= R * R && tt > best) {
              best = tt;
              kind = 1;
              u = sg > 0 ? xl : -xl;
              nx = sg * sn;
              ny = 0;
              nz = sg * ct;
            }
          }
        if (Math.abs(sn) > 1e-4 && y * y <= R * R) {
          const q = Math.sqrt(R * R - y * y);
          for (const xl of [q, -q]) {
            const tt = (x * ct - xl) / sn;
            const zl = x * sn + tt * ct;
            if (Math.abs(zl) <= T / 2 && tt > best) {
              best = tt;
              kind = 2;
              nx = (xl * ct) / R;
              ny = y / R;
              nz = (-xl * sn) / R;
              u = Math.atan2(y, xl);
            }
          }
        }
        if (!kind) {
          d[o + 3] = 0;
          continue;
        }
        const lam = Math.max(0, nx * LV[0] + ny * LV[1] + nz * LV[2]);
        const spec = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 28);
        let k = 0.42 + 0.78 * lam;
        if (kind === 1) {
          const rr = Math.hypot(u, y) / R;
          const lg = logoAt(u, y);
          if (rr > RIM) k *= 1.04;
          else if (rr > RIM - 0.06) k *= 0.5;
          else if (lg === 1) k *= 1.1;
          else if (lg === 2) k *= (Math.floor((u + 1) / LS) + Math.floor((1 - y) / LS)) % 2 ? 0.86 : 1.06;
          else k *= 0.58;
        } else k *= Math.floor(((u + Math.PI) / (Math.PI * 2)) * 96) % 2 ? 0.6 : 0.86;
        const gl = spec * (0.25 + (0.9 * (dim - 0.42)) / 0.58) * 255;
        d[o] = Math.min(255, 242 * k * dim + gl);
        d[o + 1] = Math.min(255, 241 * k * dim + gl);
        d[o + 2] = Math.min(255, 236 * k * dim + gl);
        d[o + 3] = 255;
      }
    lctx.putImageData(img, 0, 0);
    octx.clearRect(0, 0, px, px);
    octx.imageSmoothingEnabled = false;
    octx.drawImage(low, off, off, N * cell, N * cell);
    if (gap) {
      octx.globalCompositeOperation = "destination-out";
      for (let q = 1; q <= N; q++) {
        octx.fillRect(off + q * cell - gap, 0, gap, px);
        octx.fillRect(0, off + q * cell - gap, px, gap);
      }
      octx.globalCompositeOperation = "source-over";
    }
  }
  return { draw, canvas };
}

/** The coin's turn: locked, it faces you and sways; unlocked, it turns, lingering on the faces. */
export class CoinMotion {
  dim = 0.42;
  theta = 0;
  private angle = 0;
  private spinning = false;
  private burstUntil = 0;
  constructor(public locked: boolean, private reduced: boolean) {
    if (!locked) this.dim = 1;
    this.angle = reduced ? 0.3 : Math.random() * Math.PI * 2;
  }
  unlock(now: number) {
    this.locked = false;
    this.burstUntil = now + 1400;
  }
  lock() {
    this.locked = true;
    this.spinning = false;
    this.dim = 0.42;
  }
  tick(now: number, dt: number, active = false) {
    if (this.locked) {
      this.spinning = false;
      this.theta = this.reduced ? 0.2 : 0.3 * Math.sin((now / 1000) * 1.1);
      return;
    }
    if (!this.spinning) {
      // carry on from where the sway left it
      this.spinning = true;
      let p = this.theta;
      for (let i = 0; i < 6; i++) p -= (p - 0.3 * Math.sin(2 * p) - this.theta) / (1 - 0.6 * Math.cos(2 * p));
      this.angle = p;
    }
    this.dim = Math.min(1, this.dim + dt * 1.8);
    if (!this.reduced) this.angle += dt * (now < this.burstUntil ? 3.4 : active ? 2.2 : 0.9);
    this.theta = this.angle - 0.3 * Math.sin(2 * this.angle);
  }
}

/** A stand-in PFP when the real one can't be loaded: a figure in shades, colored from the handle. */
export function stubAvatar(seed: string): HTMLCanvasElement {
  let h = 2166136261;
  for (const ch of seed.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const hue = (h >>> 0) % 360;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, `hsl(${hue} 55% 36%)`);
  grd.addColorStop(1, `hsl(${(hue + 50) % 360} 60% 15%)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = `hsl(${hue} 30% 84%)`;
  g.beginPath();
  g.ellipse(128, 268, 100, 96, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(128, 112, 54, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#0b0b0d";
  g.fillRect(82, 98, 42, 20);
  g.fillRect(132, 98, 42, 20);
  g.fillRect(118, 103, 20, 6);
  return c;
}

/** The family name next/font gave a Geist face, for canvas text. */
export function fontFamily(variable: "--font-geist-pixel-square" | "--font-geist-sans") {
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim() : "";
  return v || (variable === "--font-geist-sans" ? "ui-sans-serif, system-ui, sans-serif" : "ui-monospace, monospace");
}
