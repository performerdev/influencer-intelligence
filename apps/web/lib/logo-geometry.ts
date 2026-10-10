/**
 * The "ii" mark as pixels. One bitmap drives everything — the ceramic tiles of
 * the solid "i", the LED grid of the particle "i", the SVG logomark and the
 * favicon — so they stay identical. 1 cell = CELL world units.
 *
 *   left  "i" = the human: solid ceramic tiles
 *   right "i" = the AI: the same cells, rendered as 3×3 points each
 */

export const CELL = 0.3;
/** points per cell edge in the particle "i" (3 → each cell is a 3×3 LED patch) */
export const SUB = 3;

/** Top → bottom. "#" = filled. Corners are stepped, the pixel version of the rounded stem and dot. */
export const I_BITMAP = [
  ".####.",
  "######",
  "######",
  "######",
  "######",
  ".####.",
  "......",
  ".####.",
  ...Array.from({ length: 16 }, () => "######"),
  ".####.",
] as const;

export const COLS = I_BITMAP[0].length; // 6
export const ROWS = I_BITMAP.length; // 25
/** columns between the two letters' centers */
const PITCH = 10;

export const logo = {
  stem: { w: COLS * CELL, h: 18 * CELL, d: 0.6 },
  dot: { r: (COLS * CELL) / 2 },
  gap: CELL,
  /** x of each letter's center */
  leftX: (-PITCH / 2) * CELL,
  rightX: (PITCH / 2) * CELL,
} as const;

export const LOGO_HEIGHT = ROWS * CELL; // 7.5
export const LOGO_WIDTH = PITCH * CELL + COLS * CELL; // 4.8
export const STEM_Y = -LOGO_HEIGHT / 2 + logo.stem.h / 2;
export const DOT_Y = LOGO_HEIGHT / 2 - logo.dot.r;

export type Cell = { row: number; col: number; x: number; y: number; part: "dot" | "stem" };

/** Filled cells of one "i", centers relative to the letter's center x and the mark's center y. */
export const I_CELLS: Cell[] = I_BITMAP.flatMap((line, row) =>
  [...line].flatMap((ch, col) =>
    ch === "#"
      ? [{ row, col, x: (col - (COLS - 1) / 2) * CELL, y: LOGO_HEIGHT / 2 - (row + 0.5) * CELL, part: row < 6 ? ("dot" as const) : ("stem" as const) }]
      : [],
  ),
);

const filled = (row: number, col: number) => I_BITMAP[row]?.[col] === "#";

type Vec3 = [number, number, number];

/**
 * Sample `count` points on the surface of the pixel "i" (cells extruded to the
 * stem depth), snapped to the LED lattice: SUB×SUB points per cell face, and
 * the same step through the depth on the side walls. Returns positions and
 * unit normals; x is offset by `cx`.
 */
export function sampleISurface(count: number, cx: number, r: () => number) {
  const d = logo.stem.d;
  const step = CELL / SUB;
  type Face = { c: Cell; n: Vec3 };
  const faces: Face[] = [];
  for (const c of I_CELLS) {
    faces.push({ c, n: [0, 0, 1] }, { c, n: [0, 0, -1] });
    if (!filled(c.row, c.col - 1)) faces.push({ c, n: [-1, 0, 0] });
    if (!filled(c.row, c.col + 1)) faces.push({ c, n: [1, 0, 0] });
    if (!filled(c.row - 1, c.col)) faces.push({ c, n: [0, 1, 0] });
    if (!filled(c.row + 1, c.col)) faces.push({ c, n: [0, -1, 0] });
  }
  const depthSteps = Math.max(1, Math.round(d / step));
  // Points sit a little tighter than the cell pitch, so each cell reads as its own 3×3 patch.
  const lattice = (k: number) => (k - (SUB - 1) / 2) * step * 0.78;
  const depth = (k: number) => (k - (depthSteps - 1) / 2) * step;

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const { c, n } = faces[Math.floor(r() * faces.length)];
    const a = lattice(Math.floor(r() * SUB));
    const b = lattice(Math.floor(r() * SUB));
    let p: Vec3;
    if (n[2] !== 0) p = [c.x + a, c.y + b, (n[2] * d) / 2];
    else if (n[0] !== 0) p = [c.x + (n[0] * CELL) / 2, c.y + a, depth(Math.floor(r() * depthSteps))];
    else p = [c.x + a, c.y + (n[1] * CELL) / 2, depth(Math.floor(r() * depthSteps))];
    positions.set([p[0] + cx, p[1], p[2]], i * 3);
    normals.set(n, i * 3);
  }
  return { positions, normals, step };
}
