"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { VerdictChip } from "@/components/chat/bits";
import { AppLink } from "@/components/ui/AppLink";
import { type CallRow, isoDay, pct, signed, topCoins } from "@/lib/calls";
import type { BrainStatsFile } from "@/lib/chat-brain";

const chipOf = (d: CallRow["dir"]) => (d === "buy" ? "BUY" : d === "sell" ? "SELL" : "HOLD") as "BUY" | "SELL" | "HOLD";

/** One mind's call record: headline numbers, every priced call on one chart, the coins it calls most, the latest calls. */
export function CallsDashboard({ handle, color, rows, stats }: { handle: string; color: string; rows: CallRow[]; stats: BrainStatsFile | null }) {
  const [h, setH] = useState<7 | 30>(7);
  const hz = stats?.horizons[h === 7 ? "7d" : "30d"];
  const coins = useMemo(() => new Set(rows.map((r) => r.ticker)).size, [rows]);
  const tops = useMemo(() => topCoins(rows, 8, h), [rows, h]);
  const latest = useMemo(() => rows.filter((r) => r.quote).slice(-6).reverse(), [rows]);
  const dirs = stats?.by_direction ?? { buy: 0, hold: 0, sell: 0 };

  if (!stats) return <p className="text-sm text-muted">No calls priced for @{handle} yet.</p>;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-pixel text-body">Calls · @{handle}</h2>
        <div className="flex border border-line" role="group" aria-label="Horizon">
          {([7, 30] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={h === v}
              onClick={() => setH(v)}
              className={`px-2.5 py-1 font-pixel text-xs transition-colors duration-fast ${h === v ? "bg-particle text-void" : "text-muted hover:text-ceramic"}`}
            >
              {v} days
            </button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-3 border border-line">
        {[
          ["Calls tracked", stats.calls_total.toLocaleString("en-US")],
          ["Priced", stats.calls_priced.toLocaleString("en-US")],
          ["Coins", coins.toLocaleString("en-US")],
          [`Worked in ${h}d`, pct(hz?.hit_rate ?? null)],
          [`Median ${h}d`, signed(hz?.median_return ?? null)],
          ["Median hold", stats.median_hold_days != null ? `${Math.round(stats.median_hold_days)}d` : "—"],
        ].map(([k, v], i) => (
          <div key={k} className={`grid gap-1 p-3 ${i % 3 ? "border-l border-line" : ""} ${i >= 3 ? "border-t border-line" : ""}`}>
            <dt className="font-pixel text-[11px] text-muted">{k}</dt>
            <dd className="font-pixel text-h3 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h3 className="mb-2 flex justify-between font-pixel text-[11px] text-muted">
          <span>Every priced call, move {h} days later</span>
          <span className="tabular-nums">{rows.length.toLocaleString("en-US")}</span>
        </h3>
        <Scatter rows={rows} h={h} color={color} />
        <div className="mt-2 flex gap-4 font-pixel text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2" style={{ background: color }} />
            Worked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 bg-line-hover" />
            Didn&apos;t
          </span>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-pixel text-[11px] text-muted">Call types</h3>
        <div className="flex h-2 gap-[2px]">
          <i style={{ flex: dirs.buy, background: "var(--ii-verdict-buy)" }} />
          <i style={{ flex: dirs.hold, background: "var(--ii-particle)" }} />
          <i style={{ flex: dirs.sell, background: "var(--ii-verdict-sell)" }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 font-pixel text-[11px] text-muted">
          <span>Buy {dirs.buy}</span>
          <span>Hold {dirs.hold}</span>
          <span>Sell {dirs.sell}</span>
        </div>
      </section>

      <section>
        <h3 className="mb-1 flex justify-between font-pixel text-[11px] text-muted">
          <span>Most called</span>
          <span>{h}-day</span>
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="font-pixel text-[11px] text-muted">
              <th className="py-1.5 text-left font-normal">Coin</th>
              <th className="py-1.5 text-right font-normal">Calls</th>
              <th className="py-1.5 text-right font-normal">Worked</th>
              <th className="py-1.5 text-right font-normal">Median</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {tops.map((c) => (
              <tr key={c.t} className="border-t border-line">
                <td className="py-2 font-pixel">{c.t}</td>
                <td className="py-2 text-right">{c.n}</td>
                <td className="py-2 text-right">{pct(c.worked)}</td>
                <td className={`py-2 text-right ${c.med != null && c.med > 0 ? "text-ceramic" : "text-muted"}`}>{signed(c.med)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-1 font-pixel text-[11px] text-muted">Latest calls</h3>
        <ul>
          {latest.map((c) => (
            <li key={c.postId} className="border-t border-line first:border-t-0">
              <a href={`https://x.com/${encodeURIComponent(handle)}/status/${c.postId}`} target="_blank" rel="noreferrer" className="group grid gap-1 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="origin-left scale-90">
                    <VerdictChip verdict={chipOf(c.dir)} />
                  </span>
                  <span className="font-pixel text-sm">
                    {c.ticker}
                    {c.byTicker && <span title="Matched by ticker only" className="text-muted"> ~</span>}
                  </span>
                  <span className="ml-auto font-pixel text-[11px] text-muted tabular-nums">
                    {isoDay(c.at)} · {signed(h === 7 ? c.r7 : c.r30)}
                  </span>
                </span>
                <span className="truncate text-xs text-particle group-hover:text-ceramic">“{c.quote}”</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-muted">
        Returns are signed in the call&apos;s favor: a sell followed by a drop counts as worked. Prices from DefiLlama and DexScreener, computed by code on {stats.computed_at.slice(0, 10)}, not by the model.
        {" ~ "}means the coin was matched by ticker only.{" "}
        <AppLink href={`/brain/${handle}`} className="text-particle underline decoration-line-hover underline-offset-4 hover:text-ceramic">
          Full record
        </AppLink>
      </p>
    </div>
  );
}

/** Every priced call as a dot: x = date, y = move in its favor (symlog), the mind's color when it worked. */
function Scatter({ rows, h, color }: { rows: CallRow[]; h: 7 | 30; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pts = useRef<{ x: number; y: number; c: CallRow; r: number }[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; c: CallRow; r: number } | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (!W) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const x = cv.getContext("2d")!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, W, H);
      const data = rows.map((c) => ({ c, r: h === 7 ? c.r7 : c.r30 })).filter((p): p is { c: CallRow; r: number } => p.r != null);
      const slog = (r: number) => Math.sign(r) * Math.log1p(Math.abs(r) / 0.05);
      const L = 40, R = 6, T = 6, B = 20;
      const t0 = data[0]?.c.at ?? 0;
      const t1 = data[data.length - 1]?.c.at ?? 1;
      const ymax = slog(3), ymin = slog(-0.9);
      const X = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
      const Y = (r: number) => T + (1 - (Math.min(ymax, Math.max(ymin, slog(r))) - ymin) / (ymax - ymin)) * (H - T - B);
      x.font = "10px 'Geist Pixel', ui-monospace, monospace";
      x.textBaseline = "middle";
      for (const v of [-0.5, 0, 0.5, 2]) {
        const y = Math.round(Y(v)) + 0.5;
        x.strokeStyle = v === 0 ? "#3a3a3f" : "#18181b";
        x.beginPath();
        x.moveTo(L, y);
        x.lineTo(W - R, y);
        x.stroke();
        x.fillStyle = "#6b6b70";
        x.textAlign = "right";
        x.fillText(v === 0 ? "0%" : `${v > 0 ? "+" : "−"}${Math.abs(v * 100)}%`, L - 6, y);
      }
      const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
      const step = y1 - y0 > 5 ? 2 : 1;
      x.textAlign = "center";
      x.textBaseline = "alphabetic";
      for (let yr = y0 + 1; yr <= y1; yr += step) {
        const t = Date.UTC(yr, 0, 1);
        if (t > t0) x.fillText(String(yr), X(t), H - 4);
      }
      pts.current = data.map((p) => ({ x: X(p.c.at), y: Y(p.r), c: p.c, r: p.r }));
      for (const p of pts.current) {
        x.fillStyle = p.r > 0 ? color : "#3a3a3f";
        x.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [rows, h, color]);

  const onMove = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best: (typeof pts.current)[number] | null = null;
    let bd = 10;
    for (const p of pts.current) {
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    setTip(best);
  };

  return (
    <div className="relative">
      <canvas ref={ref} onPointerMove={onMove} onPointerLeave={() => setTip(null)} className="block h-[200px] w-full" role="img" aria-label={`${rows.length} calls over time, by move ${h} days later`} />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 w-[220px] border border-line-hover bg-panel px-3 py-2 text-xs"
          style={{ left: Math.min(Math.max(0, tip.x + 12), (ref.current?.clientWidth ?? 240) - 220), top: tip.y > 100 ? tip.y - 84 : tip.y + 12 }}
        >
          <div className="flex justify-between font-pixel">
            <span>
              {tip.c.dir.toUpperCase()} {tip.c.ticker}
            </span>
            <span className="tabular-nums">{signed(tip.r)}</span>
          </div>
          <div className="mt-0.5 font-pixel text-[11px] text-muted">
            {isoDay(tip.c.at)} · {h} days later
          </div>
          {tip.c.quote && <p className="mt-1 line-clamp-2 text-particle">“{tip.c.quote}”</p>}
        </div>
      )}
    </div>
  );
}

