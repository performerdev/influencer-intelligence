"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ChartCall = {
  /** ms */
  t: number;
  ticker: string;
  dir: "buy" | "sell" | "hold";
  post: string;
  quote: string;
  r7: number | null;
  r30: number | null;
  /** priced via a ticker match on DexScreener (no address in the post) */
  byTicker?: boolean;
};

const PAD = { top: 16, right: 12, bottom: 30, left: 48 };
const TICKS = [-0.9, -0.5, 0, 1, 3, 10];
const DAY = 86_400_000;

// signed log: a +5000% memecoin and a -3% major fit on one axis without flattening everything else
const f = (r: number) => Math.sign(r) * Math.log2(1 + Math.abs(r));
// a sell before a 20x pump is a −1900% "move": pin outliers to the edge instead of squashing the plot
const LO = f(-0.95);
const HI = f(10);
const F = (r: number) => Math.min(HI, Math.max(LO, f(r)));
const pct = (r: number) => `${r > 0 ? "+" : ""}${(r * 100).toFixed(Math.abs(r) < 0.1 ? 1 : 0)}%`;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Every priced call as a dot: when it was made (x) and how the price moved
 * 7 days later, in the call's favor (y). Above the line the call worked.
 * Calls too young to price sit hollow on the line. `from` (ms) pins the left
 * edge for a period view (the last 30 days); null spans the whole record.
 */
export function CallsChart({ calls, handle, from = null }: { calls: ChartCall[]; handle: string; from?: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // drawn at the real pixel width, so labels stay 11px and a phone gets a tall enough plot
  // 0 until measured in the browser: thousands of dots stay out of the server HTML
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(Math.max(280, Math.round(el.clientWidth)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 640 ? 280 : 340;

  const pts = useMemo(() => {
    const now = Date.now();
    return calls.filter((c) => c.r7 != null || now - c.t < 8 * DAY).sort((a, b) => a.t - b.t);
  }, [calls]);
  const geo = useMemo(() => {
    if (!pts.length || !W) return null;
    const t0 = from ?? pts[0].t;
    const t1 = Math.max(from != null ? Date.now() : pts[pts.length - 1].t, t0 + DAY);
    const ys = pts.map((p) => F(p.r7 ?? 0));
    const yMin = Math.min(f(-0.5), ...ys);
    const yMax = Math.max(f(1), ...ys);
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
    // x guides: years over a long record, weeks over the last 30 days
    const guides: { t: number; label: string }[] = [];
    if (from != null) {
      for (let k = 3; k >= 0; k--) {
        const t = t1 - k * 7 * DAY;
        const d = new Date(t);
        guides.push({ t, label: `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}` });
      }
    } else {
      for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) guides.push({ t: Date.UTC(yr, 0, 1), label: String(yr) });
    }
    return { x, y, guides, ticks: TICKS.filter((r) => f(r) >= yMin && f(r) <= yMax) };
  }, [pts, from, W, H]);

  const worked = pts.filter((p) => p.r7 != null && p.r7 > 0).length;
  const missed = pts.filter((p) => p.r7 != null && p.r7 < 0).length;
  const young = pts.filter((p) => p.r7 == null).length;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = -1;
    let bd = 26 * 26; // hit radius bigger than the dot
    pts.forEach((p, i) => {
      const dx = geo.x(p.t) - mx;
      const dy = geo.y(F(p.r7 ?? 0)) - my;
      const d = dx * dx + dy * dy;
      if (d < bd) [best, bd] = [i, d];
    });
    setHover(best >= 0 ? best : null);
  };

  const hp = hover != null ? pts[hover] : null;
  const tipLeft = hp && geo ? (geo.x(hp.t) / W) * 100 : 0;
  const tipTop = hp && geo ? (geo.y(F(hp.r7 ?? 0)) / H) * 100 : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-pixel text-xs text-particle">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: "var(--ii-verdict-buy)" }} aria-hidden />
          Worked · {worked}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: "var(--ii-verdict-sell)" }} aria-hidden />
          Didn&apos;t · {missed}
        </span>
        {young > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 border border-muted" aria-hidden />
            Too recent to price · {young}
          </span>
        )}
      </div>

      <div ref={box} className="relative mt-4">
        {!W ? (
          <div style={{ height: 340 }} aria-hidden />
        ) : !geo ? (
          <p className="pt-2 text-sm text-muted">No priced calls in this period.</p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              className="block touch-pan-y"
              role="img"
              aria-label={`${pts.length} calls by @${handle}: ${worked} worked, ${missed} didn't, 7 days after the call`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onClick={() => hp && window.open(`https://x.com/${handle}/status/${hp.post}`, "_blank", "noopener")}
              style={{ cursor: hp ? "pointer" : "default" }}
            >
              {geo.ticks.map((r) => (
                <g key={r}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(f(r))} y2={geo.y(f(r))} stroke={r === 0 ? "var(--ii-line-hover)" : "var(--ii-line)"} strokeWidth={1} strokeDasharray={r === 0 ? undefined : "2 4"} />
                  <text x={PAD.left - 8} y={geo.y(f(r))} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ii-muted)" fontFamily="var(--ii-font-pixel)">
                    {r === 0 ? "0" : pct(r)}
                  </text>
                </g>
              ))}
              {geo.guides
                .filter((_, i, all) => W >= 640 || all.length <= 6 || i % 2 === 0)
                .map((g) => (
                  <g key={g.t}>
                    <line x1={geo.x(g.t)} x2={geo.x(g.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ii-line)" strokeWidth={1} />
                    <text x={Math.min(W - PAD.right - 20, Math.max(PAD.left + 20, geo.x(g.t)))} y={H - PAD.bottom + 18} textAnchor="middle" fontSize={11} fill="var(--ii-muted)" fontFamily="var(--ii-font-pixel)">
                      {g.label}
                    </text>
                  </g>
                ))}
              {pts.map((p, i) => {
                const s = hover === i ? 10 : 7;
                const cx = geo.x(p.t);
                const cy = geo.y(F(p.r7 ?? 0));
                if (p.r7 == null) return <rect key={`${p.post}-${i}`} x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill="none" stroke="var(--ii-muted)" strokeWidth={1} />;
                return (
                  <rect
                    key={`${p.post}-${i}`}
                    x={cx - s / 2}
                    y={cy - s / 2}
                    width={s}
                    height={s}
                    fill={p.r7 > 0 ? "var(--ii-verdict-buy)" : p.r7 < 0 ? "var(--ii-verdict-sell)" : "var(--ii-particle)"}
                    fillOpacity={hover == null || hover === i ? 0.85 : 0.35}
                    stroke="var(--ii-panel)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </svg>
            {hp && (
              <div
                className="pointer-events-none absolute z-10 w-[min(280px,80vw)] border border-line-hover bg-void p-3"
                style={
                  W < 640
                    ? // phone: pinned across the top of the plot, never off-screen
                      { left: 0, right: 0, top: 0, width: "auto" }
                    : {
                        left: `${tipLeft}%`,
                        top: `${tipTop}%`,
                        transform: `translate(${tipLeft > 60 ? "calc(-100% - 12px)" : "12px"}, ${tipTop > 55 ? "calc(-100% - 8px)" : "8px"})`,
                      }
                }
              >
                <p className="font-pixel text-sm text-ceramic">
                  {hp.dir.toUpperCase()} ${hp.ticker.replace(/^\$/, "")} · <span className="text-particle">{day(hp.t)}</span>
                </p>
                <p className="mt-1 font-pixel text-xs text-particle">
                  {hp.r7 == null ? (
                    "Too recent to price"
                  ) : (
                    <>
                      7d: <span className="text-ceramic">{pct(hp.r7)}</span>
                      {hp.r30 != null ? ` · 30d: ${pct(hp.r30)}` : ""}
                    </>
                  )}
                </p>
                {hp.quote && <p className="mt-2 line-clamp-3 text-xs text-particle">“{hp.quote}”</p>}
                {hp.byTicker && <p className="mt-2 font-pixel text-xs text-muted">Coin matched by ticker on DexScreener</p>}
                <p className="mt-2 font-pixel text-xs text-muted">Click to open the post ↗</p>
              </div>
            )}
            <p className="mt-2 font-pixel text-xs text-muted">Price move 7 days after the call, in the call&apos;s favor (a sell followed by a drop counts as worked). Log scale.</p>
          </>
        )}
      </div>
    </div>
  );
}
