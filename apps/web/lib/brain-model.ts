/**
 * The brain every intelligence is drawn with: the reference picture's side
 * view, inflated into 3D. Each grid cell of the silhouette becomes a point on
 * the outer (lateral) surface of both hemispheres, the gyri from the picture
 * are raised as real relief, and the hemispheres sit apart along the top so
 * the longitudinal fissure shows from the front and from above. Steep edges
 * are filled with wall points so there are no holes as it turns.
 *
 * Axes: x = left/right (thickness), y = up, z = front/back (the long axis), so
 * a turn around y shows the profile at ±90°. Max radius ≈ 1.
 */
import { BRAIN_G, BRAIN_GH, BRAIN_GW, BRAIN_H, BRAIN_S, BRAIN_ZMAX } from "./brain-shape";

export type BrainModel = {
  n: number;
  /** xyz per point */
  pos: Float32Array;
  /** unit surface normal per point */
  nrm: Float32Array;
  /** 1 on a gyrus (ridge) … 0 in a sulcus (groove) */
  fold: Float32Array;
  /** 0..1, a stable per-spot random value (twinkle phase) */
  seed: Float32Array;
  /** 0 (top of the brain) … 1 (bottom), for matching portrait rows */
  row: Float32Array;
};

const FISSURE = 0.07; // how far each hemisphere sits off the midline
const MEDIAL = 0.45; // how fast the inner face closes the fissure
const RELIEF = 0.05; // depth of the gyri

function bytes(b64: string): Uint8Array {
  if (typeof atob === "function") return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Van der Corput in base 2: spreads the first n points evenly over the brain. */
function radicalInverse(i: number) {
  let r = 0;
  let f = 0.5;
  while (i > 0) {
    if (i & 1) r += f;
    i >>>= 1;
    f *= 0.5;
  }
  return r;
}
function morton(x: number, y: number) {
  let m = 0;
  for (let b = 0; b < 8; b++) m |= (((x >> b) & 1) << (2 * b)) | (((y >> b) & 1) << (2 * b + 1));
  return m;
}
const hash01 = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

let model: BrainModel | null = null;

export function brainModel(): BrainModel {
  if (model) return model;
  const GW = BRAIN_GW;
  const GH = BRAIN_GH;
  const hB = bytes(BRAIN_H);
  const sB = bytes(BRAIN_S);
  const gB = bytes(BRAIN_G);
  const cs = 2 / GW;
  const N = GW * GH;
  const inside = new Uint8Array(N);
  const shade = new Float32Array(N);
  const c = new Float32Array(N);
  const lat = new Float32Array(N);
  const med = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    if (!hB[k]) continue;
    inside[k] = 1;
    const h = (hB[k] / 255) * BRAIN_ZMAX;
    shade[k] = sB[k] / 255;
    c[k] = FISSURE * (gB[k] / 255);
    lat[k] = c[k] + h + RELIEF * (shade[k] - 0.5) * Math.min(1, h / 0.1);
    med[k] = c[k] - MEDIAL * h;
  }
  const at = (arr: Float32Array, x: number, y: number, fallback: number) => (x >= 0 && y >= 0 && x < GW && y < GH && inside[y * GW + x] ? arr[y * GW + x] : fallback);

  type P = { x: number; y: number; z: number; nx: number; ny: number; nz: number; f: number; s: number; key: number };
  const pts: P[] = [];
  for (let gy = 0; gy < GH; gy++)
    for (let gx = 0; gx < GW; gx++) {
      const k = gy * GW + gx;
      if (!inside[k]) continue;
      const Z = (gx + 0.5) * cs - 1; // long axis, front of the picture → z = -1
      const Y = (GH / 2 - gy - 0.5) * cs;
      const edge = c[k];
      const seed = hash01(gx, gy);
      const base = radicalInverse(morton(gx, gy));
      for (const surf of [1, -1] as const) {
        const arr = surf > 0 ? lat : med;
        let v = arr[k];
        if (surf < 0 && v <= 0.004) {
          // the floor of the fissure, only where it opens up next door
          let near = false;
          for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) if (at(med, gx + i, gy + j, 0) > 0.004) near = true;
          if (!near) continue;
          v = 0.004;
        }
        const l = at(arr, gx - 1, gy, edge);
        const r = at(arr, gx + 1, gy, edge);
        const u = at(arr, gx, gy - 1, edge);
        const d = at(arr, gx, gy + 1, edge);
        const dz = (r - l) / (2 * cs);
        const dy = (u - d) / (2 * cs);
        const inv = 1 / Math.hypot(1, dy, dz);
        const nx = surf * inv;
        const ny = -surf * dy * inv;
        const nz = -surf * dz * inv;
        // walls down (outer surface) or up (inner face) to the neighbours, so steep parts stay closed
        const levels = [v];
        if (surf > 0) {
          const lo = Math.min(l, r, u, d);
          for (let t = v - cs; t > lo + cs * 0.3; t -= cs) levels.push(t);
        } else {
          const hi = Math.max(l, r, u, d);
          for (let t = v + cs; t < hi - cs * 0.3; t += cs) levels.push(t);
        }
        const f = surf > 0 ? shade[k] : 0.12;
        levels.forEach((lv, li) => {
          for (const side of [1, -1]) {
            // outer surface first, walls and inner faces later: a small n still reads as a brain
            const key = (surf > 0 && li === 0 ? 0 : 1) + base + (side < 0 ? 0.5 / (GW * GH) : 0) + li * 1e-6;
            pts.push({ x: lv * side, y: Y, z: Z, nx: nx * side, ny, nz, f, s: seed, key });
          }
        });
      }
    }
  pts.sort((a, b) => a.key - b.key);

  // center and scale to a max radius of 1
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const yc = (y0 + y1) / 2;
  let maxR = 0;
  for (const p of pts) {
    p.y -= yc;
    maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
  }
  const n = pts.length;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const fold = new Float32Array(n);
  const seed = new Float32Array(n);
  const row = new Float32Array(n);
  pts.forEach((p, i) => {
    pos[i * 3] = p.x / maxR;
    pos[i * 3 + 1] = p.y / maxR;
    pos[i * 3 + 2] = p.z / maxR;
    nrm[i * 3] = p.nx;
    nrm[i * 3 + 1] = p.ny;
    nrm[i * 3 + 2] = p.nz;
    fold[i] = p.f;
    seed[i] = p.s;
    row[i] = (y1 - (p.y + yc)) / (y1 - y0 || 1);
  });
  model = { n, pos, nrm, fold, seed, row };
  return model;
}
