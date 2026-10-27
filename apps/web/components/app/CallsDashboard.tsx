"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { VerdictChip } from "@/components/chat/bits";
import { AppLink } from "@/components/ui/AppLink";
import { type Period, PeriodToggle } from "@/components/ui/PeriodToggle";
import { type CallRow, isoDay, pct, record, signed, topCoins } from "@/lib/calls";
import type { BrainCall, BrainStatsFile } from "@/lib/chat-brain";

const DAY = 864e5;
const chipOf = (d: CallRow["dir"]) => (d === "buy" ? "BUY" : d === "sell" ? "SELL" : "HOLD") as "BUY" | "SELL" | "HOLD";

/**
 * One mind's call record for a period (all time, or calls made in the last 30
 * days): headline numbers, every priced call on one chart, call types, the
 * coins it calls most, the latest calls. "Worked" = the price moved the call's
 * way 7 (or 30) days after it was made.
 */
export function CallsDashboard({ handle, color, rows, calls, stats }: { handle: string; color: string; rows: CallRow[]; calls: BrainCall[]; stats: BrainStatsFile | null }) {
  const [period, setPeriod] = useState<Period>("all");
  const since = period === "all" ? -Infinity : Date.now() - 30 * DAY;

  const view = useMemo(() => {
    const all = calls.filter((c) => new Date(c.called_at).getTime() >= since);
    const priced = rows.filter((r) => r.at >= since);
    const dirs = { buy: 0, hold: 0, sell: 0 };
    for (const c of all) dirs[c.direction] += 1;
    return {
      total: all.length,
      coins: new Set(all.map((c) => c.ticker.toUpperCase())).size,
      priced,
      r7: record(priced, 7),
      r30: record(priced, 30),
      dirs,
      tops: topCoins(priced, 8, 7),
      latest: priced.filter((r) => r.quote).slice(-6).reverse(),
    };
  }, [calls, rows, since]);

  if (!stats) return <p className="text-sm text-muted">No calls priced for @{handle} yet.</p>;
  const empty = view.total === 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <h2 className="truncate font-pixel text-body">Calls · @{handle}</h2>
        <div className="flex items-center justify-between gap-3">
          <PeriodToggle value={period} onChange={setPeriod} />
          <AppLink href={`/brain/${encodeURIComponent(handle)}#record`} className="btn-line h-8 shrink-0 whitespace-nowrap px-3 text-xs">
            Full track record <span aria-hidden>↗</span>
          </AppLink>
        </div>
      </div>

      <dl className="grid grid-cols-3 border border-line">
        {[
          ["Calls", view.total.toLocaleString("en-US")],
          ["Coins", view.coins.toLocaleString("en-US")],
          ["Priced", view.priced.filter((r) => r.r7 != null || r.r30 != null).length.toLocaleString("en-US")],
          ["Worked in 7d", pct(view.r7.worked)],
          ["Median 7d", signed(view.r7.med)],
          ["Worked in 30d", pct(view.r30.worked)],
        ].map(([k, v], i) => (
          <div key={k} className={`grid gap-1 p-3 ${i % 3 ? "border-l border-line" : ""} ${i >= 3 ? "border-t border-line" : ""}`}>
            <dt className="font-pixel text-[11px] text-muted">{k}</dt>
            <dd className="font-pixel text-h3 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {empty ? (
        <p className="text-sm text-muted">No calls from @{handle} in the last 30 days.</p>
      ) : (
        <>
          <section>
            <h3 className="mb-2 flex justify-between font-pixel text-[11px] text-muted">
              <span>Every priced call, move 7 days later</span>
              <span className="tabular-nums">{view.priced.length.toLocaleString("en-US")}</span>
            </h3>
            <Scatter rows={view.priced} from={period === "all" ? null : since} color={color} />
            <div className="mt-2 flex gap-4 font-pixel text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2 w-2" style={{ background: color }} />
                Worked
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2 w-2 bg-line-hover" />
                Didn&apos;t
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2 w-2 border border-line-hover" />
                Too recent to price
              </span>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-pixel text-[11px] text-muted">Call types</h3>
            <div className="flex h-2 gap-[2px]">
              <i style={{ flex: view.dirs.buy, background: "var(--ii-verdict-buy)" }} />
              <i style={{ flex: view.dirs.hold, background: "var(--ii-particle)" }} />
              <i style={{ flex: view.dirs.sell, background: "var(--ii-verdict-sell)" }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 font-pixel text-[11px] text-muted">
              <span>Buy {view.dirs.buy}</span>
              <span>Hold {view.dirs.hold}</span>
              <span>Sell {view.dirs.sell}</span>
            </div>
          </section>

          {view.tops.length > 0 && (
            <section>
              <h3 className="mb-1 flex justify-between font-pixel text-[11px] text-muted">
                <span>Most called</span>
                <span>7-day move</span>
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
                  {view.tops.map((c) => (
                    <tr key={c.t} className="border-t border-line">
                      <td className="py-2 font-pixel">
                        <AppLink href={`/coin/${encodeURIComponent(c.t)}`} className="hover:underline" title={`Every mind's calls on $${c.t}`}>
                          {c.t}
                        </AppLink>
                      </td>
                      <td className="py-2 text-right">{c.n}</td>
                      <td className="py-2 text-right">{pct(c.worked)}</td>
                      <td className={`py-2 text-right ${c.med != null && c.med > 0 ? "text-ceramic" : "text-muted"}`}>{signed(c.med)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {view.latest.length > 0 && (
            <section>
              <h3 className="mb-1 font-pixel text-[11px] text-muted">Latest calls</h3>
              <ul>
                {view.latest.map((c) => (
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
                          {isoDay(c.at)} · {signed(c.r7)}
                        </span>
                      </span>
                      <span className="truncate text-xs text-particle group-hover:text-ceramic">“{c.quote}”</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="text-xs leading-relaxed text-muted">
        &ldquo;Worked&rdquo; means the price moved the call&apos;s way: a sell followed by a drop counts. Calls under 7 days old aren&apos;t priced yet. Prices from DefiLlama and DexScreener, computed by code on {stats.computed_at.slice(0, 10)}, not by the
        model. ~ means the coin was matched by ticker only.
      </p>
    </div>
  );
}

/** Priced calls as dots: x = date (from `from`, or the first call), y = 7-day move in the call's favor (symlog); unpriced recent calls sit hollow on 0. */
function Scatter({ rows, from, color }: { rows: CallRow[]; from: number | null; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pts = useRef<{ x: number; y: number; c: CallRow; r: number | null }[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; c: CallRow; r: number | null } | null>(null);

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
      const slog = (r: number) => Math.sign(r) * Math.log1p(Math.abs(r) / 0.05);
      const L = 40, R = 6, T = 6, B = 20;
      const t0 = from ?? rows[0]?.at ?? Date.now() - DAY;
      const t1 = from != null ? Date.now() : (rows[rows.length - 1]?.at ?? Date.now());
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
      // x labels: years for all time, weeks for the last 30 days
      x.textAlign = "center";
      x.textBaseline = "alphabetic";
      x.fillStyle = "#6b6b70";
      if (from != null) {
        for (let k = 3; k >= 0; k--) {
          const t = t1 - k * 7 * DAY;
          const d = new Date(t);
          x.fillText(`${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`, Math.min(W - R - 18, Math.max(L + 18, X(t))), H - 4);
        }
      } else {
        const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
        const step = y1 - y0 > 5 ? 2 : 1;
        for (let yr = y0 + 1; yr <= y1; yr += step) {
          const t = Date.UTC(yr, 0, 1);
          if (t > t0) x.fillText(String(yr), X(t), H - 4);
        }
      }
      pts.current = rows.map((c) => ({ x: X(c.at), y: Y(c.r7 ?? 0), c, r: c.r7 }));
      for (const p of pts.current) {
        if (p.r == null) {
          x.strokeStyle = "#6b6b70";
          x.strokeRect(Math.round(p.x) - 1.5, Math.round(p.y) - 1.5, 3, 3);
          continue;
        }
        x.fillStyle = p.r > 0 ? color : "#3a3a3f";
        x.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [rows, from, color]);

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
      <canvas ref={ref} onPointerMove={onMove} onPointerLeave={() => setTip(null)} className="block h-[200px] w-full" role="img" aria-label={`${rows.length} calls over time, by move 7 days later`} />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 w-[220px] border border-line-hover bg-panel px-3 py-2 text-xs"
          style={{ left: Math.min(Math.max(0, tip.x + 12), (ref.current?.clientWidth ?? 240) - 220), top: tip.y > 100 ? tip.y - 84 : tip.y + 12 }}
        >
          <div className="flex justify-between font-pixel">
            <span>
              {tip.c.dir.toUpperCase()} {tip.c.ticker}
            </span>
            <span className="tabular-nums">{tip.r == null ? "not priced yet" : signed(tip.r)}</span>
          </div>
          <div className="mt-0.5 font-pixel text-[11px] text-muted">{isoDay(tip.c.at)} · move 7 days later</div>
          {tip.c.quote && <p className="mt-1 line-clamp-2 text-particle">“{tip.c.quote}”</p>}
        </div>
      )}
    </div>
  );
}
