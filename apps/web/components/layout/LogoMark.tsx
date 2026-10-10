import { COLS, I_BITMAP, ROWS, SUB } from "@/lib/logo-geometry";

/**
 * The "ii" mark as pixel art, from the same bitmap as the 3D hero.
 * Small (top bar, favicon): the human "i" is solid, the AI "i" is a 50% dither
 * of the same cells. Large (no-WebGL hero): the AI "i" is drawn as 3×3 LED
 * points per cell, like the particle "i".
 */
const PITCH = 10; // columns between letter centers, as in the hero
const W = PITCH + COLS; // 16
const RIGHT = PITCH; // x of the right letter's first column

const cells = I_BITMAP.flatMap((line, y) => [...line].flatMap((ch, x) => (ch === "#" ? [{ x, y }] : [])));

/** Solid letter as one path of 1×1 squares (crisp edges merge them). */
const SOLID = cells.map(({ x, y }) => `M${x} ${y}h1v1h-1z`).join("");
/** Checkerboard of the same cells, shifted to the right letter. */
const DITHER = cells.filter(({ x, y }) => (x + y) % 2 === 0).map(({ x, y }) => `M${x + RIGHT} ${y}h1v1h-1z`).join("");
/** 3×3 LED points per cell, each point 60% of its slot. */
const LED = (() => {
  const s = 1 / SUB;
  const d = s * 0.6;
  const o = (s - d) / 2;
  return cells
    .flatMap(({ x, y }) =>
      Array.from({ length: SUB * SUB }, (_, k) => `M${(x + RIGHT + (k % SUB) * s + o).toFixed(3)} ${(y + Math.floor(k / SUB) * s + o).toFixed(3)}h${d.toFixed(3)}v${d.toFixed(3)}h-${d.toFixed(3)}z`),
    )
    .join("");
})();

export function LogoMark({ size = 25, detail, className }: { size?: number; detail?: "dither" | "led"; className?: string }) {
  const mode = detail ?? (size >= 120 ? "led" : "dither");
  return (
    <svg
      viewBox={`0 0 ${W} ${ROWS}`}
      height={size}
      width={(size * W) / ROWS}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
    >
      <path d={SOLID} fill="var(--ii-ceramic)" />
      <path d={mode === "led" ? LED : DITHER} fill="var(--ii-particle)" />
    </svg>
  );
}

/** Same mark as a standalone SVG string (favicon / README). */
export function logoSvg({ background = "#050506", ceramic = "#F2F1EC", particle = "#B9B8B2", pad = 3 } = {}) {
  const w = W + pad * 2;
  const h = ROWS + pad * 2;
  const side = Math.max(w, h);
  const ox = Math.floor((side - W) / 2); // whole pixels, so the favicon stays crisp
  const oy = Math.floor((side - ROWS) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="${background}"/><g transform="translate(${ox} ${oy})"><path d="${SOLID}" fill="${ceramic}"/><path d="${DITHER}" fill="${particle}"/></g></svg>`;
}
