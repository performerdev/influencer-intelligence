import { BRAIN_GH, BRAIN_GW, BRAIN_H, BRAIN_S } from "./brain-shape";

/**
 * The brain in side view as an SVG of LED cells (for share cards and other
 * static places): the same traced shape and gyri the site animates.
 */
export function brainSvg(color: string, opts: { step?: number; cell?: number } = {}): { svg: string; width: number; height: number } {
  const step = opts.step ?? 2; // grid cells merged per LED
  const cell = opts.cell ?? 8; // px per LED
  const h = Buffer.from(BRAIN_H, "base64");
  const s = Buffer.from(BRAIN_S, "base64");
  const n = parseInt(color.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const W = Math.floor(BRAIN_GW / step);
  const H = Math.floor(BRAIN_GH / step);
  const rects: string[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let inside = 0;
      let shade = 0;
      for (let j = 0; j < step; j++)
        for (let i = 0; i < step; i++) {
          const k = (y * step + j) * BRAIN_GW + x * step + i;
          if (h[k]) {
            inside++;
            shade += s[k] / 255;
          }
        }
      if (inside * 2 < step * step) continue;
      const v = Math.min(1.25, 0.32 + 0.95 * (shade / inside));
      const hot = Math.max(0, v - 1) * 255 * 0.6;
      const c = (ch: number) => Math.round(Math.min(255, ch * Math.min(1, v) + hot));
      rects.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell - 1}" height="${cell - 1}" fill="rgb(${c(r)},${c(g)},${c(b)})"/>`);
    }
  const width = W * cell;
  const height = H * cell;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects.join("")}</svg>`, width, height };
}
