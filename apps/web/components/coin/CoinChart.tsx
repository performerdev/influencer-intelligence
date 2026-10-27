"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { type Dir, day, money, signed } from "@/lib/record";

export type ChartMind = { code: string; handle: string; color: string };
export type CoinPoint = { t: number; m: number; dir: Dir; price: number; r7: number | null; r30: number | null; quote: string; post: string };

const PAD = { top: 14, right: 12, bottom: 28, left: 56 };

/**
 * One coin's price (log scale) with every mind's calls on it, each at the price
 * when it was made. Colour says who, shape says what: a filled square is a buy,
 * a hollow square a hold, a triangle a sell. Minds can be switched off in the
 * legend; a click on a call opens the post.
 */
export function CoinChart({ ticker, history, calls, minds }: { ticker: string; history: [number, number][]; calls: CoinPoint[]; minds: ChartMind[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<CoinPoint | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(Math.max(280, Math.round(el.clientWidth)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 640 ? 280 : 360;
  const present = useMemo(() => [...new Set(calls.map((c) => c.m))], [calls]);
  const shown = useMemo(() => calls.filter((c) => !off.has(c.m)), [calls, off]);

  const geo = useMemo(() => {
    if (!W || (!history.length && !calls.length)) return null;
    const ts = [...history.map((h) => h[0]), ...calls.map((c) => c.t)];
    const ps = [...history.map((h) => h[1]), ...calls.map((c) => c.price)].filter((p) => p > 0);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts, t0 + 864e5);
    const lo = Math.log10(Math.min(...ps)) - 0.05;
    const hi = Math.log10(Math.max(...ps)) + 0.05;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (p: number) => PAD.top + (1 - (Math.log10(p) - lo) / Math.max(0.1, hi - lo)) * (H - PAD.top - PAD.bottom);
    // price guides on powers of ten (and halves when the range is narrow)
    const ticks: number[] = [];
    for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) for (const k of hi - lo < 1.5 ? [1, 2, 5] : [1]) {
      const v = k * 10 ** e;
      if (Math.log10(v) >= lo && Math.log10(v) <= hi) ticks.push(v);
    }
    const years: number[] = [];
    for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) years.push(Date.UTC(yr, 0, 1));
    const path = history.map(([t, p], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(p).toFixed(1)}`).join("");
    return { x, y, ticks, years, path };
  }, [W, H, history, calls]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: CoinPoint | null = null;
    let bd = 22 * 22;
    for (const c of shown) {
      const dx = geo.x(c.t) - mx;
      const dy = geo.y(c.price) - my;
      if (dx * dx + dy * dy < bd) [best, bd] = [c, dx * dx + dy * dy];
    }
    setHover(best);
  };

  const label = (v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString("en-US")}k` : v >= 1 ? `$${v}` : `$${v.toPrecision(1)}`);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Minds on the chart">
        {present.map((m) => {
          const it = minds[m];
          const on = !off.has(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => setOff((s) => (s.has(m) ? new Set([...s].filter((x) => x !== m)) : new Set([...s, m])))}
              className={`inline-flex items-center gap-2 border px-2.5 py-1 font-pixel text-xs transition-colors duration-fast ${on ? "border-line-hover text-ceramic" : "border-line text-muted line-through"}`}
            >
              <i className="inline-block h-2 w-2" style={{ background: on ? it.color : "var(--ii-line-hover)" }} />@{it.handle}
            </button>
          );
        })}
        <span className="ml-auto flex flex-wrap gap-3 font-pixel text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 bg-particle" />
            Buy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 border border-particle" />
            Hold
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="9" height="8" aria-hidden>
              <path d="M0.5 0.5 L8.5 0.5 L4.5 7.5 Z" fill="none" stroke="var(--ii-particle)" />
            </svg>
            Sell
          </span>
        </span>
      </div>

      <div ref={box} className="relative mt-4">
        {!W ? (
          <div style={{ height: 360 }} aria-hidden />
        ) : !geo ? (
          <p className="text-sm text-muted">No priced calls on ${ticker} yet.</p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              className="block touch-pan-y"
              role="img"
              aria-label={`$${ticker} price on a log scale with ${shown.length} calls by ${present.length} minds`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onClick={() => hover && window.open(`https://x.com/${minds[hover.m].handle}/status/${hover.post}`, "_blank", "noopener")}
              style={{ cursor: hover ? "pointer" : "default" }}
            >
              {geo.ticks.map((v) => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--ii-line)" />
                  <text x={PAD.left - 8} y={geo.y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ii-muted)" fontFamily="var(--ii-font-pixel)">
                    {label(v)}
                  </text>
                </g>
              ))}
              {geo.years.map((t) => (
                <g key={t}>
                  <line x1={geo.x(t)} x2={geo.x(t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ii-line)" />
                  <text x={geo.x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ii-muted)" fontFamily="var(--ii-font-pixel)">
                    {new Date(t).getUTCFullYear()}
                  </text>
                </g>
              ))}
              {geo.path && <path d={geo.path} fill="none" stroke="var(--ii-particle)" strokeWidth={1.25} strokeOpacity={0.8} />}
              {shown.map((c, i) => {
                const cx = geo.x(c.t);
                const cy = geo.y(c.price);
                const color = minds[c.m].color;
                const s = hover === c ? 10 : 7;
                const dim = hover && hover !== c ? 0.45 : 1;
                if (c.dir === "sell")
                  return <path key={i} d={`M${cx - s / 2},${cy - s / 2} L${cx + s / 2},${cy - s / 2} L${cx},${cy + s / 2} Z`} fill="var(--ii-void)" stroke={color} strokeWidth={1.5} opacity={dim} />;
                if (c.dir === "hold") return <rect key={i} x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill="var(--ii-void)" stroke={color} strokeWidth={1.5} opacity={dim} />;
                return <rect key={i} x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill={color} stroke="var(--ii-void)" strokeWidth={1} opacity={dim} />;
              })}
            </svg>
            {hover && (
              <div
                className="pointer-events-none absolute z-10 w-[min(280px,80vw)] border border-line-hover bg-void p-3"
                style={
                  W < 640
                    ? { left: 0, right: 0, top: 0, width: "auto" }
                    : {
                        left: `${(geo.x(hover.t) / W) * 100}%`,
                        top: `${(geo.y(hover.price) / H) * 100}%`,
                        transform: `translate(${geo.x(hover.t) / W > 0.6 ? "calc(-100% - 12px)" : "12px"}, ${geo.y(hover.price) / H > 0.55 ? "calc(-100% - 8px)" : "8px"})`,
                      }
                }
              >
                <p className="font-pixel text-sm" style={{ color: minds[hover.m].color }}>
                  @{minds[hover.m].handle}
                </p>
                <p className="mt-0.5 font-pixel text-xs text-ceramic">
                  {hover.dir.toUpperCase()} ${ticker} at {money(hover.price)} · <span className="text-particle">{day(hover.t)}</span>
                </p>
                <p className="mt-1 font-pixel text-xs text-particle">
                  7d {signed(hover.r7)} · 30d {signed(hover.r30)}
                </p>
                {hover.quote && <p className="mt-2 line-clamp-3 text-xs text-particle">“{hover.quote}”</p>}
                <p className="mt-2 font-pixel text-xs text-muted">Click to open the post ↗</p>
              </div>
            )}
            <p className="mt-2 font-pixel text-xs text-muted">
              {history.length ? "Price from DefiLlama, log scale." : "No price history for this coin, calls are placed at their own price."} Moves are signed in the call&apos;s favor.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
