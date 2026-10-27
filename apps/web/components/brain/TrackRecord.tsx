"use client";

import { useMemo, useRef, useState } from "react";

import { type Period, PeriodToggle } from "@/components/ui/PeriodToggle";

import { CallsChart, type ChartCall } from "./CallsChart";

/**
 * One call, packed small for the page payload (a big record runs to thousands):
 * [minutes since epoch, ticker, b|s|h, post id, quote, price at call, 7d move, 30d move, matched by ticker only]
 * Moves are signed in the call's favor.
 */
export type RecordTuple = [number, string, "b" | "s" | "h", string, string, number | null, number | null, number | null, 0 | 1];

type Dir = "buy" | "sell" | "hold";
type Row = { t: number; ticker: string; dir: Dir; post: string; quote: string; price: number | null; r7: number | null; r30: number | null; byTicker: boolean };
type Side = "all" | Dir;
type Outcome = "all" | "worked" | "didnt" | "unpriced";
type Sort = "new" | "old" | "best7" | "worst7" | "best30" | "worst30";

const DIRS = { b: "buy", s: "sell", h: "hold" } as const;
const DAY = 864e5;
const PAGE = 50;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const share = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const signed = (r: number | null) => {
  if (r == null) return "—";
  const a = Math.abs(r * 100);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${a >= 100 ? a.toFixed(0) : a.toFixed(1)}%`;
};
const money = (n: number | null) => {
  if (n == null || !(n > 0)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  // three significant digits, never exponent notation
  return `$${n.toFixed(Math.min(12, 2 - Math.floor(Math.log10(n))))}`;
};
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

function summarize(rows: Row[]) {
  const r7 = rows.map((r) => r.r7).filter((x): x is number => x != null);
  const r30 = rows.map((r) => r.r30).filter((x): x is number => x != null);
  return {
    n: rows.length,
    coins: new Set(rows.map((r) => r.ticker)).size,
    priced: rows.filter((r) => r.price != null).length,
    w7: r7.length ? r7.filter((x) => x > 0).length / r7.length : null,
    m7: median(r7),
    n7: r7.length,
    w30: r30.length ? r30.filter((x) => x > 0).length / r30.length : null,
    m30: median(r30),
    n30: r30.length,
  };
}

/**
 * A mind's full track record: every call it ever made in public posts, for all
 * time or the last 30 days — headline numbers, the chart, the coins it calls
 * most, and the complete list with filters and a CSV download. Prices and
 * moves come from the stats the build computed by code, never from a model.
 */
export function TrackRecord({ handle, data, medianHold, holdPairs }: { handle: string; data: RecordTuple[]; medianHold: number | null; holdPairs: number }) {
  const all = useMemo<Row[]>(
    () =>
      data
        .map(([m, ticker, d, post, quote, price, r7, r30, bt]) => ({ t: m * 6e4, ticker, dir: DIRS[d], post, quote, price, r7, r30, byTicker: bt === 1 }))
        .sort((a, b) => a.t - b.t),
    [data],
  );
  const [period, setPeriod] = useState<Period>("all");
  const [coin, setCoin] = useState("");
  const [side, setSide] = useState<Side>("all");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [shown, setShown] = useState(PAGE);
  const listRef = useRef<HTMLElement>(null);

  const since = period === "30d" ? Date.now() - 30 * DAY : -Infinity;
  const rows = useMemo(() => all.filter((r) => r.t >= since), [all, since]);
  const sum = useMemo(() => summarize(rows), [rows]);
  const chart = useMemo<ChartCall[]>(() => rows.map((r) => ({ t: r.t, ticker: r.ticker, dir: r.dir, post: r.post, quote: r.quote, r7: r.r7, r30: r.r30, byTicker: r.byTicker })), [rows]);

  const tops = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows) g.set(r.ticker, [...(g.get(r.ticker) ?? []), r]);
    return [...g.entries()]
      .map(([k, cs]) => ({ k, first: cs[0].t, last: cs[cs.length - 1].t, buy: cs.filter((c) => c.dir === "buy").length, sell: cs.filter((c) => c.dir === "sell").length, hold: cs.filter((c) => c.dir === "hold").length, ...summarize(cs) }))
      .sort((a, b) => b.n - a.n || a.k.localeCompare(b.k))
      .slice(0, 12);
  }, [rows]);

  const list = useMemo(() => {
    const q = coin.trim().replace(/^\$/, "").toUpperCase();
    const xs = rows.filter(
      (r) =>
        (!q || r.ticker.startsWith(q)) &&
        (side === "all" || r.dir === side) &&
        (outcome === "all" ||
          (outcome === "worked" && (r.r7 ?? r.r30 ?? 0) > 0) ||
          (outcome === "didnt" && (r.r7 ?? r.r30 ?? 0) < 0) ||
          (outcome === "unpriced" && r.r7 == null && r.r30 == null)),
    );
    const by = (k: "r7" | "r30", dirn: 1 | -1) => (a: Row, b: Row) => (a[k] == null ? 1 : b[k] == null ? -1 : dirn * (b[k]! - a[k]!));
    const cmp: Record<Sort, (a: Row, b: Row) => number> = { new: (a, b) => b.t - a.t, old: (a, b) => a.t - b.t, best7: by("r7", 1), worst7: by("r7", -1), best30: by("r30", 1), worst30: by("r30", -1) };
    return [...xs].sort(cmp[sort]);
  }, [rows, coin, side, outcome, sort]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setShown(PAGE);
  };
  const pickCoin = (k: string) => {
    setCoin(k);
    setShown(PAGE);
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const download = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [
      "date,call,coin,price_at_call_usd,move_7d,move_30d,matched_by_ticker_only,quote,post",
      ...list.map((r) =>
        [day(r.t), r.dir, r.ticker, r.price ?? "", r.r7 == null ? "" : r.r7.toFixed(4), r.r30 == null ? "" : r.r30.toFixed(4), r.byTicker ? "yes" : "", esc(r.quote), `https://x.com/${handle}/status/${r.post}`].join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${handle}-calls${period === "30d" ? "-30d" : ""}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      {/* period + numbers */}
      <section id="record" className="mt-12 scroll-mt-[calc(var(--ii-topbar-h)+24px)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h3">Track record</h2>
          <PeriodToggle
            value={period}
            onChange={(p) => {
              setPeriod(p);
              setShown(PAGE);
            }}
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Calls", sum.n.toLocaleString("en-US"), `${sum.coins.toLocaleString("en-US")} coins · ${sum.priced.toLocaleString("en-US")} with a price`],
            ["Worked after 7 days", share(sum.w7), sum.n7 ? `median move ${signed(sum.m7)} · n=${sum.n7}` : "no priced calls"],
            ["Worked after 30 days", share(sum.w30), sum.n30 ? `median move ${signed(sum.m30)} · n=${sum.n30}` : period === "30d" ? "calls under 30 days old aren't priced at 30 days yet" : "no priced calls"],
            ["Median hold", medianHold != null ? `${Math.round(medianHold)}d` : "—", holdPairs ? `buy → sell, ${holdPairs} pairs · all time` : "no buy → sell pairs"],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-panel border border-line bg-panel p-4">
              <p className="label-mono">{label}</p>
              <p className="mt-2 font-pixel text-h3 tabular-nums text-ceramic">{value}</p>
              <p className="mt-1 font-pixel text-xs text-muted">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* every priced call */}
      <section className="mt-12">
        <h2 className="text-h3">Every call, priced</h2>
        <div className="mt-5 rounded-panel border border-line bg-panel p-4 sm:p-5">
          <CallsChart calls={chart} handle={handle} from={period === "30d" ? since : null} />
        </div>
      </section>

      {/* most-called coins */}
      {tops.length > 0 && (
        <section className="mt-12">
          <h2 className="text-h3">Most-called coins</h2>
          <p className="mt-2 text-sm text-particle">Pick a coin to see every call on it below.</p>
          <div className="mt-5 overflow-x-auto rounded-panel border border-line" data-lenis-prevent>
            <table className="w-full min-w-[760px] text-left font-pixel text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2.5 font-normal">Coin</th>
                  <th className="px-3 py-2.5 text-right font-normal">Calls</th>
                  <th className="px-3 py-2.5 font-normal">Buy · sell · hold</th>
                  <th className="px-3 py-2.5 font-normal">First → last</th>
                  <th className="px-3 py-2.5 text-right font-normal">Worked 7d</th>
                  <th className="px-3 py-2.5 text-right font-normal">Median 7d</th>
                  <th className="px-3 py-2.5 text-right font-normal">Worked 30d</th>
                  <th className="px-3 py-2.5 text-right font-normal">Median 30d</th>
                </tr>
              </thead>
              <tbody className="text-particle">
                {tops.map((t) => (
                  <tr key={t.k} onClick={() => pickCoin(t.k)} className="cursor-pointer border-b border-line transition-colors duration-fast last:border-0 hover:bg-void">
                    <td className="px-3 py-2.5 text-ceramic">
                      <button type="button" onClick={() => pickCoin(t.k)} className="hover:underline">
                        ${t.k}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right">{t.n}</td>
                    <td className="px-3 py-2.5">
                      {t.buy} · {t.sell} · {t.hold}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {day(t.first)} → {day(t.last)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{t.n7 ? `${share(t.w7)} of ${t.n7}` : <span className="text-muted">no price</span>}</td>
                    <td className="px-3 py-2.5 text-right">{t.n7 ? signed(t.m7) : ""}</td>
                    <td className="px-3 py-2.5 text-right">{t.n30 ? `${share(t.w30)} of ${t.n30}` : <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">{t.n30 ? signed(t.m30) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* every call */}
      <section ref={listRef} id="calls" className="mt-12 scroll-mt-[calc(var(--ii-topbar-h)+24px)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-h3">All calls</h2>
            <p className="mt-2 font-pixel text-xs text-muted">
              Showing {Math.min(shown, list.length).toLocaleString("en-US")} of {list.length.toLocaleString("en-US")}
              {list.length !== rows.length ? ` (filtered from ${rows.length.toLocaleString("en-US")})` : ""}
            </p>
          </div>
          <button type="button" onClick={download} disabled={!list.length} className="btn-line h-9 px-3 text-xs disabled:opacity-40">
            Download CSV
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex h-9 items-center gap-2 border border-line bg-panel px-2.5 focus-within:border-line-hover">
            <span className="font-pixel text-xs text-muted">$</span>
            <span className="sr-only">Coin</span>
            <input
              value={coin}
              onChange={(e) => reset(setCoin)(e.target.value)}
              placeholder="Coin"
              maxLength={16}
              autoComplete="off"
              className="w-24 bg-transparent font-pixel text-xs uppercase placeholder:normal-case placeholder:text-muted focus:outline-none"
            />
            {coin && (
              <button type="button" onClick={() => reset(setCoin)("")} aria-label="Clear coin" className="font-pixel text-xs text-muted hover:text-ceramic">
                ×
              </button>
            )}
          </label>
          <div className="flex h-9 border border-line" role="group" aria-label="Call">
            {(["all", "buy", "hold", "sell"] as const).map((s, i) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                onClick={() => reset(setSide)(s)}
                className={`whitespace-nowrap px-2.5 font-pixel text-xs capitalize transition-colors duration-fast ${i ? "border-l border-line" : ""} ${side === s ? "bg-particle text-void" : "text-muted hover:text-ceramic"}`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          <Select label="Outcome" value={outcome} onChange={(v) => reset(setOutcome)(v as Outcome)} options={[["all", "Any outcome"], ["worked", "Worked"], ["didnt", "Didn't work"], ["unpriced", "No price"]]} />
          <Select label="Sort" value={sort} onChange={(v) => reset(setSort)(v as Sort)} options={[["new", "Newest first"], ["old", "Oldest first"], ["best7", "Best 7d"], ["worst7", "Worst 7d"], ["best30", "Best 30d"], ["worst30", "Worst 30d"]]} />
        </div>

        <div className="mt-4 border border-line">
          <div className="hidden grid-cols-[92px_60px_minmax(0,1fr)_120px_76px_76px_20px] gap-x-3 border-b border-line px-4 py-2.5 font-pixel text-[11px] text-muted sm:grid">
            <span>Date</span>
            <span>Call</span>
            <span>Coin</span>
            <span className="text-right">Price at call</span>
            <span className="text-right">7 days</span>
            <span className="text-right">30 days</span>
            <span />
          </div>
          {list.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No calls match.</p>
          ) : (
            <ul className="divide-y divide-line">
              {list.slice(0, shown).map((r) => (
                <CallLine key={`${r.post}-${r.ticker}`} r={r} handle={handle} onCoin={pickCoin} />
              ))}
            </ul>
          )}
        </div>
        {shown < list.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-line h-9 px-4 text-xs">
              Show {Math.min(PAGE, list.length - shown)} more
            </button>
            {list.length - shown > PAGE && (
              <button type="button" onClick={() => setShown(list.length)} className="link-quiet h-9 px-2 text-xs">
                Show all {list.length.toLocaleString("en-US")}
              </button>
            )}
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Moves are signed in the call&apos;s favor: a sell followed by a drop counts as worked. ~ means the coin was matched by ticker alone, so now and then it can be a different coin with the same name. &ldquo;No price&rdquo; means no price history was found for it (stocks, very old or dead coins).
        </p>
      </section>
    </>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex h-9 items-center border border-line bg-panel focus-within:border-line-hover">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-full cursor-pointer bg-transparent px-2.5 font-pixel text-xs text-particle focus:outline-none">
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-panel">
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function DirChip({ dir }: { dir: Dir }) {
  const color = dir === "buy" ? "var(--ii-verdict-buy)" : dir === "sell" ? "var(--ii-verdict-sell)" : "var(--ii-ceramic)";
  return (
    <span className="inline-flex h-6 items-center rounded-pill border px-2 font-mono text-[11px] tracking-[0.08em]" style={{ color, borderColor: dir === "hold" ? "var(--ii-line-hover)" : `color-mix(in srgb, ${color} 45%, transparent)` }}>
      {dir.toUpperCase()}
    </span>
  );
}

const tone = (r: number | null) => (r == null ? "text-muted" : r > 0 ? "text-ceramic" : "text-muted");

function CallLine({ r, handle, onCoin }: { r: Row; handle: string; onCoin: (k: string) => void }) {
  const url = `https://x.com/${handle}/status/${r.post}`;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 font-pixel text-xs sm:grid-cols-[92px_60px_minmax(0,1fr)_120px_76px_76px_20px]">
      <span className="order-3 text-right text-muted tabular-nums sm:order-none sm:text-left">{day(r.t)}</span>
      <span className="order-1 sm:order-none">
        <DirChip dir={r.dir} />
      </span>
      <span className="order-2 min-w-0 truncate sm:order-none">
        <button type="button" onClick={() => onCoin(r.ticker)} className="text-ceramic hover:underline">
          ${r.ticker}
        </button>
        {r.byTicker && (
          <span title="Matched by ticker only" className="text-muted">
            {" "}
            ~
          </span>
        )}
      </span>
      <span className="hidden text-right text-particle tabular-nums sm:block">{money(r.price)}</span>
      <span className={`hidden text-right tabular-nums sm:block ${tone(r.r7)}`}>{signed(r.r7)}</span>
      <span className={`hidden text-right tabular-nums sm:block ${tone(r.r30)}`}>{signed(r.r30)}</span>
      <a href={url} target="_blank" rel="noreferrer" className="link-quiet hidden justify-self-end sm:block" aria-label="Open the post on X">
        <span className="arrow">↗</span>
      </a>
      <p className="order-4 col-span-3 flex flex-wrap gap-x-3 text-particle tabular-nums sm:hidden">
        <span>at {money(r.price)}</span>
        <span className={tone(r.r7)}>7d {signed(r.r7)}</span>
        <span className={tone(r.r30)}>30d {signed(r.r30)}</span>
        <a href={url} target="_blank" rel="noreferrer" className="link-quiet ml-auto">
          Post <span className="arrow">↗</span>
        </a>
      </p>
      {r.quote && <p className="order-5 col-span-3 line-clamp-2 font-sans text-sm text-particle sm:order-none sm:col-span-7 sm:line-clamp-1 sm:pl-[176px]">“{r.quote}”</p>}
    </li>
  );
}
