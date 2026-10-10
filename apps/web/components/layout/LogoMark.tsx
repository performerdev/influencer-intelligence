import { DOT_Y, LOGO_HEIGHT, LOGO_WIDTH, STEM_Y, logo } from "@/lib/logo-geometry";
import { rng } from "@/lib/random";

/**
 * The "ii" mark as a tiny SVG for the top bar and favicon: a solid ceramic "i"
 * and the same shape stippled with points. Built from the same geometry as
 * the 3D hero. SVG y points down, so world y is negated.
 */
const { stem, dot, leftX, rightX } = logo;

const STIPPLE = (() => {
  const r = rng(42);
  const dots: Array<[number, number, number]> = [];
  const step = 0.36;
  // stem
  for (let y = -stem.h / 2 + 0.14; y <= stem.h / 2 - 0.1; y += step)
    for (let x = -stem.w / 2 + 0.12; x <= stem.w / 2 - 0.08; x += step) {
      const jx = x + (r() - 0.5) * step * 0.7;
      const jy = y + (r() - 0.5) * step * 0.7;
      dots.push([rightX + jx, -(STEM_Y + jy), 0.085 + r() * 0.06]);
    }
  // dot
  for (let y = -dot.r; y <= dot.r; y += step)
    for (let x = -dot.r; x <= dot.r; x += step) {
      const jx = x + (r() - 0.5) * step * 0.7;
      const jy = y + (r() - 0.5) * step * 0.7;
      if (jx * jx + jy * jy > (dot.r - 0.05) ** 2) continue;
      dots.push([rightX + jx, -(DOT_Y + jy), 0.085 + r() * 0.06]);
    }
  return dots;
})();

export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  const vb = `${-LOGO_WIDTH / 2} ${-LOGO_HEIGHT / 2} ${LOGO_WIDTH} ${LOGO_HEIGHT}`;
  return (
    <svg
      viewBox={vb}
      height={size}
      width={(size * LOGO_WIDTH) / LOGO_HEIGHT}
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect
        x={leftX - stem.w / 2}
        y={-(STEM_Y + stem.h / 2)}
        width={stem.w}
        height={stem.h}
        rx={stem.r}
        fill="var(--ii-ceramic)"
      />
      <circle cx={leftX} cy={-DOT_Y} r={dot.r} fill="var(--ii-ceramic)" />
      <g fill="var(--ii-particle)">
        {STIPPLE.map(([x, y, r], i) => (
          <circle key={i} cx={x.toFixed(3)} cy={y.toFixed(3)} r={r.toFixed(3)} />
        ))}
      </g>
    </svg>
  );
}
