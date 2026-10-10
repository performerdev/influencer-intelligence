/**
 * The "ii" mark in world units, measured from the logo render
 * (1 unit = 100px of the 1254px master). Shared by the ceramic mesh, the
 * particle "i", the SVG logomark and the README media so all stay identical.
 */

export const logo = {
  stem: { w: 1.85, h: 5.46, d: 1.1, r: 0.4 },
  dot: { r: 0.94 },
  /** gap between the top of the stem and the bottom of the dot */
  gap: 0.18,
  /** x of each letter's center; left = solid human, right = particle AI */
  leftX: -1.495,
  rightX: 1.495,
} as const;

export const LOGO_HEIGHT = logo.stem.h + logo.gap + logo.dot.r * 2; // 7.52
export const LOGO_WIDTH = logo.rightX - logo.leftX + logo.stem.w; // 4.84
/** y of the stem center / dot center, with the whole mark centered on 0 */
export const STEM_Y = -LOGO_HEIGHT / 2 + logo.stem.h / 2;
export const DOT_Y = LOGO_HEIGHT / 2 - logo.dot.r;

type Vec3 = [number, number, number];
type Patch = { area: number; sample: (r: () => number) => { p: Vec3; n: Vec3 } };

/** Area-uniform sampler for a rounded box (Minkowski sum of a box and a sphere). */
function roundedBoxPatches(w: number, h: number, d: number, rad: number): Patch[] {
  const ax = w / 2 - rad;
  const ay = h / 2 - rad;
  const az = d / 2 - rad;
  const patches: Patch[] = [];
  const u = (r: () => number, half: number) => (r() * 2 - 1) * half;

  // 6 flat faces
  for (const s of [-1, 1]) {
    patches.push({
      area: 4 * ay * az,
      sample: (r) => ({ p: [s * (ax + rad), u(r, ay), u(r, az)], n: [s, 0, 0] }),
    });
    patches.push({
      area: 4 * ax * az,
      sample: (r) => ({ p: [u(r, ax), s * (ay + rad), u(r, az)], n: [0, s, 0] }),
    });
    patches.push({
      area: 4 * ax * ay,
      sample: (r) => ({ p: [u(r, ax), u(r, ay), s * (az + rad)], n: [0, 0, s] }),
    });
  }

  // 12 quarter-cylinder edges
  const edge = (axis: 0 | 1 | 2, sA: number, sB: number): Patch => {
    const half = [ax, ay, az][axis];
    const [i, j] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const inner = [ax, ay, az];
    return {
      area: (Math.PI / 2) * rad * 2 * half,
      sample: (r) => {
        const t = (r() * Math.PI) / 2;
        const n: Vec3 = [0, 0, 0];
        n[i] = sA * Math.cos(t);
        n[j] = sB * Math.sin(t);
        const p: Vec3 = [0, 0, 0];
        p[axis] = u(r, half);
        p[i] = sA * inner[i] + n[i] * rad;
        p[j] = sB * inner[j] + n[j] * rad;
        return { p, n };
      },
    };
  };
  for (const axis of [0, 1, 2] as const)
    for (const sA of [-1, 1]) for (const sB of [-1, 1]) patches.push(edge(axis, sA, sB));

  // 8 sphere-octant corners
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        patches.push({
          area: (Math.PI * rad * rad) / 2,
          sample: (r) => {
            const n = unitVector(r);
            const nn: Vec3 = [Math.abs(n[0]) * sx, Math.abs(n[1]) * sy, Math.abs(n[2]) * sz];
            return {
              p: [sx * ax + nn[0] * rad, sy * ay + nn[1] * rad, sz * az + nn[2] * rad],
              n: nn,
            };
          },
        });

  return patches;
}

function unitVector(r: () => number): Vec3 {
  const z = r() * 2 - 1;
  const a = r() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), s * Math.sin(a), z];
}

/**
 * Sample `count` points uniformly over the surface of one "i" centered at
 * x = cx. Returns interleaved xyz positions and unit normals.
 */
export function sampleISurface(count: number, cx: number, r: () => number) {
  const { stem, dot } = logo;
  const patches: Patch[] = roundedBoxPatches(stem.w, stem.h, stem.d, stem.r).map((p) => ({
    area: p.area,
    sample: (rr) => {
      const s = p.sample(rr);
      return { p: [s.p[0] + cx, s.p[1] + STEM_Y, s.p[2]], n: s.n };
    },
  }));
  patches.push({
    area: 4 * Math.PI * dot.r * dot.r,
    sample: (rr) => {
      const n = unitVector(rr);
      return { p: [cx + n[0] * dot.r, DOT_Y + n[1] * dot.r, n[2] * dot.r], n };
    },
  });

  const total = patches.reduce((a, p) => a + p.area, 0);
  const cdf: number[] = [];
  let acc = 0;
  for (const p of patches) cdf.push((acc += p.area / total));

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const x = r();
    let idx = 0;
    while (idx < cdf.length - 1 && x > cdf[idx]) idx++;
    const { p, n } = patches[idx].sample(r);
    positions.set(p, k * 3);
    normals.set(n, k * 3);
  }
  return { positions, normals };
}
