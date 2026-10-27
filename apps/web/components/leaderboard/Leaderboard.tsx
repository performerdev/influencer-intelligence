"use client";

import { useMemo, useState } from "react";

import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import type { Intelligence } from "@/lib/intelligences";
import { median, share, signed } from "@/lib/record";

/** A priced call: [mind index, day number, kind (0 major, 1 alt or meme, 2 stock), 7d move, 30d move, ticker index, post id] */
export type BoardRow = [number, number, 0 | 1 | 2, number | null, number | null, number, string];
type Period = "all" | "1y" | "90d";
type Kinds = "all" | "0" | "1" | "2";
type H = "7" | "30";

const MIN_N = 20;
const today = () => Math.floor(Date.now() / 864e5);
const dayOf = (d: number) => new Date(d * 864e5).toISOString().slice(0, 10);

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex border border-line" role="group" aria-label={label}>
      {options.map(([v, l], i) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`whitespace-nowrap px-2.5 py-1.5 font-pixel text-xs transition-colors duration-fast ${i ? "border-l border-line" : ""} ${value === v ? "bg-particle text-void" : "text-muted hover:text-ceramic"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/**
 * Who on CT calls best: every mind's priced calls, ranked by how often the
 * price moved their way within 7 or 30 days. Fewer than 20 priced calls in the
 * selection is too small to rank, so those minds sit at the bottom.
 */
export function Leaderboard({ rows, tickers, minds }: { rows: BoardRow[]; tickers: string[]; minds: Intelligence[] }) {
  const [period, setPeriod] = useState<Period>("all");
  const [kinds, setKinds] = useState<Kinds>("all");
  const [h, setH] = useState<H>("7");

  const sel = useMemo(() => {
    const from = period === "all" ? -Infinity : today() - (period === "1y" ? 365 : 90);
    return rows.filter((r) => r[1] >= from && (kinds === "all" || String(r[2]) === kinds));
  }, [rows, period, kinds]);

  const board = useMemo(() => {
    const by = new Map<number, BoardRow[]>();
    for (const r of sel) by.set(r[0], [...(by.get(r[0]) ?? []), r]);
    const k = h === "7" ? 3 : 4;
    const o = h === "7" ? 4 : 3;
    return [...by.entries()]
      .map(([m, rs]) => {
        const xs = rs.map((r) => r[k]).filter((x): x is number => x != null);
        const ys = rs.map((r) => r[o]).filter((x): x is number => x != null);
        const best = rs.filter((r) => r[k] != null).sort((a, b) => (b[k] as number) - (a[k] as number))[0];
        return {
          m,
          n: xs.length,
          worked: xs.length ? xs.filter((x) => x > 0).length / xs.length : null,
          med: median(xs),
          otherN: ys.length,
          other: ys.length ? ys.filter((x) => x > 0).length / ys.length : null,
          best,
        };
      })
      .filter((b) => b.n > 0)
      .sort((a, b) => Number(b.n >= MIN_N) - Number(a.n >= MIN_N) || (b.worked ?? 0) - (a.worked ?? 0) || (b.med ?? 0) - (a.med ?? 0));
  }, [sel, h]);

  const extremes = useMemo(() => {
    const k = h === "7" ? 3 : 4;
    const xs = sel.filter((r) => r[k] != null).sort((a, b) => (b[k] as number) - (a[k] as number));
    return { best: xs.slice(0, 8), worst: xs.slice(-8).reverse(), k };
  }, [sel, h]);

  const ranked = board.filter((b) => b.n >= MIN_N).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="Period" value={period} onChange={setPeriod} options={[["all", "All time"], ["1y", "Last 12 months"], ["90d", "Last 90 days"]]} />
        <Seg label="Assets" value={kinds} onChange={setKinds} options={[["all", "All"], ["0", "Majors"], ["1", "Alts & memes"], ["2", "Stocks"]]} />
        <Seg label="Horizon" value={h} onChange={setH} options={[["7", "7 days"], ["30", "30 days"]]} />
      </div>

      <div className="mt-5 overflow-x-auto border border-line" data-lenis-prevent>
        <table className="w-full min-w-[760px] text-left font-pixel text-xs">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="w-10 px-3 py-2.5 font-normal">#</th>
              <th className="px-3 py-2.5 font-normal">Mind</th>
              <th className="px-3 py-2.5 text-right font-normal">Priced calls</th>
              <th className="px-3 py-2.5 text-right font-normal">Worked in {h}d</th>
              <th className="px-3 py-2.5 text-right font-normal">Median move</th>
              <th className="px-3 py-2.5 text-right font-normal">Worked in {h === "7" ? "30" : "7"}d</th>
              <th className="px-3 py-2.5 font-normal">Best call</th>
            </tr>
          </thead>
          <tbody>
            {board.map((b, i) => {
              const it = minds[b.m];
              const small = b.n < MIN_N;
              return (
                <tr key={b.m} className={`border-b border-line last:border-0 ${small ? "text-muted" : "text-particle"}`}>
                  <td className="px-3 py-3 tabular-nums">{small ? "—" : i + 1}</td>
                  <td className="px-3 py-3">
                    <AppLink href={`/brain/${encodeURIComponent(it.handle)}#record`} className="flex items-center gap-3 hover:text-ceramic">
                      <BrainAvatar it={it} size={28} />
                      <span>
                        <span className="block font-mono text-[10px]" style={{ color: it.color }}>
                          {it.code}
                        </span>
                        <span className="text-sm text-ceramic">@{it.handle}</span>
                      </span>
                    </AppLink>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {b.n}
                    {small && <span className="block text-[10px]">small sample</span>}
                  </td>
                  <td className={`px-3 py-3 text-right text-sm tabular-nums ${small ? "" : "text-ceramic"}`}>{share(b.worked)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{signed(b.med)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{b.otherN ? share(b.other) : "—"}</td>
                  <td className="px-3 py-3">
                    {b.best ? (
                      <a href={`https://x.com/${it.handle}/status/${b.best[6]}`} target="_blank" rel="noreferrer" className="hover:text-ceramic">
                        ${tickers[b.best[5]]} <span className="text-ceramic">{signed(b.best[h === "7" ? 3 : 4])}</span> <span className="text-muted">{dayOf(b.best[1])} ↗</span>
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {!board.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-sm text-muted">
                  No priced calls in this selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-pixel text-xs text-muted">
        {ranked} of {board.length} minds ranked. Ranked by how often the price moved the call&apos;s way within {h} days, then by the median move. Under {MIN_N} priced calls is listed but not ranked.
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        {(
          [
            ["Best calls", extremes.best],
            ["Worst calls", extremes.worst],
          ] as const
        ).map(([title, list]) => (
          <section key={title}>
            <h2 className="text-h3">{title}</h2>
            <p className="mt-1 font-pixel text-xs text-muted">Move {h} days after the call, in its favor</p>
            <ul className="mt-4 divide-y divide-line border border-line">
              {list.map((r) => {
                const it = minds[r[0]];
                return (
                  <li key={`${r[0]}-${r[6]}-${r[5]}`} className="flex items-center gap-3 px-4 py-2.5 font-pixel text-xs">
                    <span className="w-16 shrink-0 text-right text-sm tabular-nums text-ceramic">{signed(r[extremes.k] as number)}</span>
                    <AppLink href={`/coin/${encodeURIComponent(tickers[r[5]])}`} className="text-ceramic hover:underline">
                      ${tickers[r[5]]}
                    </AppLink>
                    <span className="min-w-0 truncate" style={{ color: it.color }}>
                      @{it.handle}
                    </span>
                    <a href={`https://x.com/${it.handle}/status/${r[6]}`} target="_blank" rel="noreferrer" className="link-quiet ml-auto shrink-0 text-xs">
                      {dayOf(r[1])} <span className="arrow">↗</span>
                    </a>
                  </li>
                );
              })}
              {!list.length && <li className="px-4 py-4 text-sm text-muted">Nothing here yet.</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
