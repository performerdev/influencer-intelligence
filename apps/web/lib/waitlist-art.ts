/**
 * The Waitlist role: a square badge on the same LED grid as the brains and the
 * coin, with stepped corners and the ii mark inside (solid i, dithered i).
 * Dim while locked, lit in the role's color once it's yours; a diagonal beam
 * sweeps across it (the LEDs it passes go white), like the copy pass on the logo.
 */
import { I_BITMAP } from "@/lib/logo-geometry";

const N = 37; // cells across
const LW = 16; // the two letters, 10 columns apart
const LH = I_BITMAP.length; // 25

/** 0 empty, 1 frame, 2 inside, 3 solid i, 4 dithered i */
const GRID = (() => {
  const g = new Uint8Array(N * N);
  const CUT = 3; // stepped corners
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const cx = Math.min(x, N - 1 - x);
      const cy = Math.min(y, N - 1 - y);
      if (cx + cy < CUT) continue;
      g[y * N + x] = cx === 0 || cy === 0 || cx + cy === CUT ? 1 : 2;
    }
  const ox = Math.floor((N - LW) / 2);
  const oy = Math.floor((N - LH) / 2);
  I_BITMAP.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      if (ch !== "#") return;
      g[(oy + y) * N + ox + x] = 3;
      if ((x + y) % 2 === 0) g[(oy + y) * N + ox + x + 10] = 4;
    }),
  );
  return g;
})();

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

export type RoleRenderer = {
  /** lit 0 (locked) … 1; beam −1 = none, else 0 … 1 across the badge */
  draw: (lit: number, beam: number) => void;
  canvas: HTMLCanvasElement;
};

/** A badge `px` device pixels square. */
export function createRole(px: number, color: string): RoleRenderer {
  const cell = px / N;
  const gap = cell >= 3.5 ? Math.max(1, Math.round(cell / 4.5)) : 0;
  const low = document.createElement("canvas");
  low.width = low.height = N;
  const lctx = low.getContext("2d")!;
  const img = lctx.createImageData(N, N);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const octx = canvas.getContext("2d")!;
  const C = rgb(color);
  const FRAME = [58, 58, 63];
  const INSIDE = [12, 12, 14];
  const SOLID = [242, 241, 236];
  const DITH = [185, 184, 178];
  const WHITE = [255, 255, 255];

  function draw(lit: number, beam: number) {
    const dim = 0.4 + 0.6 * lit;
    const d = img.data;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const v = GRID[y * N + x];
        const o = (y * N + x) * 4;
        if (!v) {
          d[o + 3] = 0;
          continue;
        }
        let c: number[];
        if (v === 1) c = mix(FRAME, C, lit);
        else if (v === 2) c = mix(INSIDE, mix(INSIDE, C, 0.07), lit);
        else c = (v === 3 ? SOLID : DITH).map((k) => k * dim);
        if (beam >= -0.5) {
          const along = (x + (N - 1 - y)) / (2 * N - 2);
          const b = Math.max(0, 1 - Math.abs(along - beam) / 0.09);
          if (b > 0) c = mix(c, WHITE, b * (v === 2 ? 0.12 : 0.9));
        }
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = 255;
      }
    lctx.putImageData(img, 0, 0);
    octx.clearRect(0, 0, px, px);
    octx.imageSmoothingEnabled = false;
    octx.drawImage(low, 0, 0, px, px);
    if (gap) {
      octx.globalCompositeOperation = "destination-out";
      for (let q = 1; q < N; q++) {
        const at = Math.round(q * cell);
        octx.fillRect(at - gap, 0, gap, px);
        octx.fillRect(0, at - gap, px, gap);
      }
      octx.globalCompositeOperation = "source-over";
    }
  }
  return { draw, canvas };
}

/** The role's color before it's anyone's: ceramic. */
export const ROLE_INK = "#f2f1ec";

/* ───────── the spot on an LED board (the waitlist card) ───────── */

/** 5×7 LED-matrix glyphs for the spot number */
const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
};

/** A string on the 5×7 board, one column of space between glyphs: lit[row][col]. */
export function ledMatrix(str: string) {
  const chars = [...str].filter((c) => GLYPHS[c]);
  const cols = Math.max(1, chars.length * 6 - 1);
  const lit: boolean[][] = [];
  for (let y = 0; y < 7; y++) {
    const row: boolean[] = [];
    chars.forEach((c, i) => {
      for (let x = 0; x < 5; x++) row.push(GLYPHS[c][y][x] === "1");
      if (i < chars.length - 1) row.push(false);
    });
    lit.push(row);
  }
  return { cols, rows: 7, lit };
}
