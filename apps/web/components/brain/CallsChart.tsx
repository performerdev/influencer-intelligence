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

// signed log: a +5000% memecoin and a -3% major fit on one axis without flattening everything else
const f = (r: number) => Math.sign(r) * Math.log2(1 + Math.abs(r));
const pct = (r: number) => `${r > 0 ? "+" : ""}${(r * 100).toFixed(Math.abs(r) < 0.1 ? 1 : 0)}%`;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Every priced call as a dot: when it was made (x) and how the price moved
 * afterwards, in the call's favor (y). Above the line the call worked.
 * Position carries the meaning; green/red repeats it.
 */
export function CallsChart({ calls, handle }: { calls: ChartCall[]; handle: string }) {
  const [h, setH] = useState<"r7" | "r30">("r30");
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // drawn at the real pixel width, so labels stay 11px and a phone gets a tall enough plot
  const [W, setW] = useState(960);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 640 ? 280 : 340;

  const pts = useMemo(() => calls.filter((c) => c[h] != null).sort((a, b) => a.t - b.t), [calls, h]);
  const geo = useMemo(() => {
    if (!pts.length) return null;
    const t0 = pts[0].t;
    const t1 = Math.max(pts[pts.length - 1].t, t0 + 86_400_000);
    const ys = pts.map((p) => f(p[h]!));
    const yMin = Math.min(f(-0.5), ...ys);
    const yMax = Math.max(f(1), ...ys);
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
    const years: number[] = [];
    for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) years.push(Date.UTC(yr, 0, 1));
    return { x, y, years, ticks: TICKS.filter((r) => f(r) >= yMin && f(r) <= yMax), yMin, yMax };
  }, [pts, h, W, H]);

  const worked = pts.filter((p) => p[h]! > 0).length;
  const missed = pts.filter((p) => p[h]! < 0).length;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = -1;
    let bd = 26 * 26; // hit radius bigger than the dot
    pts.forEach((p, i) => {
      const dx = geo.x(p.t) - mx;
      const dy = geo.y(f(p[h]!)) - my;
      const d = dx * dx + dy * dy;
      if (d < bd) [best, bd] = [i, d];
    });
    setHover(best >= 0 ? best : null);
  };

  const hp = hover != null ? pts[hover] : null;
  const tipLeft = hp && geo ? (geo.x(hp.t) / W) * 100 : 0;
  const tipTop = hp && geo ? (geo.y(f(hp[h]!)) / H) * 100 : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 font-pixel text-xs text-particle">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--ii-verdict-buy)" }} aria-hidden />
            Worked · {worked}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--ii-verdict-sell)" }} aria-hidden />
            Didn&apos;t · {missed}
          </span>
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Horizon">
          {(
            [
              ["r7", "after 7 days"],
              ["r30", "after 30 days"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={h === k}
              onClick={() => {
                setH(k);
                setHover(null);
              }}
              className={`rounded-pill border px-3 py-1 font-mono text-xs ${h === k ? "border-ceramic text-ceramic" : "border-line text-muted hover:text-particle"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div ref={box} className="relative mt-4">
      {!geo ? (
        <p className="pt-2 text-sm text-muted">No priced calls yet.</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="block touch-pan-y"
            role="img"
            aria-label={`${pts.length} priced calls by @${handle}: ${worked} worked, ${missed} didn't, ${h === "r7" ? "7" : "30"} days after the call`}
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
            {geo.years.filter((_, i, all) => W >= 640 || all.length <= 6 || i % 2 === 0).map((t) => (
              <g key={t}>
                <line x1={geo.x(t)} x2={geo.x(t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ii-line)" strokeWidth={1} />
                <text x={geo.x(t)} y={H - PAD.bottom + 18} textAnchor="middle" fontSize={11} fill="var(--ii-muted)" fontFamily="var(--ii-font-pixel)">
                  {new Date(t).getUTCFullYear()}
                </text>
              </g>
            ))}
            {pts.map((p, i) => {
              const v = p[h]!;
              return (
                <circle
                  key={`${p.post}-${i}`}
                  cx={geo.x(p.t)}
                  cy={geo.y(f(v))}
                  r={hover === i ? 6 : 4}
                  fill={v > 0 ? "var(--ii-verdict-buy)" : v < 0 ? "var(--ii-verdict-sell)" : "var(--ii-particle)"}
                  fillOpacity={hover == null || hover === i ? 0.85 : 0.35}
                  stroke="var(--ii-panel)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
          {hp && (
            <div
              className="pointer-events-none absolute z-10 w-[min(280px,80vw)] rounded-panel border border-line-hover bg-void p-3"
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
                {h === "r7" ? "7d" : "30d"}: <span className="text-ceramic">{pct(hp[h]!)}</span>
                {h === "r30" && hp.r7 != null ? ` · 7d: ${pct(hp.r7)}` : h === "r7" && hp.r30 != null ? ` · 30d: ${pct(hp.r30)}` : ""}
              </p>
              {hp.quote && <p className="mt-2 line-clamp-3 text-xs text-particle">“{hp.quote}”</p>}
              {hp.byTicker && <p className="mt-2 font-pixel text-xs text-muted">Coin matched by ticker on DexScreener</p>}
              <p className="mt-2 font-pixel text-xs text-muted">Click to open the post ↗</p>
            </div>
          )}
          <p className="mt-2 font-pixel text-xs text-muted">Price move after the call, in the call&apos;s favor (a sell followed by a drop counts as worked). Log scale.</p>
        </>
      )}
      </div>
    </div>
  );
}
