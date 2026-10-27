"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AppLink } from "@/components/ui/AppLink";
import type { Dir } from "@/lib/record";

import type { ChartMind } from "./CoinChart";

/** One coin across every mind: [ticker, calls, minds (index, most calls first), last call day, last mind, last dir, buy now, sell now, worked 7d % (−1 = none), priced 7d, hold now] */
export type CoinRow = [string, number, number[], number, number, "b" | "s" | "h", number, number, number, number, number];
type Sort = "calls" | "minds" | "recent" | "record";

const PAGE = 50;
const DIRS: Record<"b" | "s" | "h", Dir> = { b: "buy", s: "sell", h: "hold" };
const dayOf = (d: number) => new Date(d * 864e5).toISOString().slice(0, 10);

export function CoinsIndex({ coins, minds }: { coins: CoinRow[]; minds: ChartMind[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("calls");
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => {
    const k = q.trim().replace(/^\$/, "").toUpperCase();
    const xs = coins.filter((c) => !k || c[0].includes(k));
    const by: Record<Sort, (a: CoinRow, b: CoinRow) => number> = {
      calls: (a, b) => b[1] - a[1],
      minds: (a, b) => b[2].length - a[2].length || b[1] - a[1],
      recent: (a, b) => b[3] - a[3],
      // a record needs at least 5 priced calls to rank
      record: (a, b) => (b[9] >= 5 ? b[8] : -2) - (a[9] >= 5 ? a[8] : -2) || b[9] - a[9],
    };
    // an exact ticker match goes first
    return [...xs].sort((a, b) => Number(b[0] === k) - Number(a[0] === k) || by[sort](a, b));
  }, [coins, q, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            const k = q.trim().replace(/^\$/, "").toUpperCase();
            if (/^[A-Z0-9]{1,15}$/.test(k)) router.push(`/coin/${encodeURIComponent(list[0]?.[0] === k || !list.length ? k : list[0][0])}`);
          }}
        >
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 border border-line bg-panel px-3 focus-within:border-line-hover sm:max-w-[360px]">
          <span className="font-pixel text-sm text-muted">$</span>
          <span className="sr-only">Find a coin</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Find a coin, Enter to open it"
            maxLength={16}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-pixel text-sm uppercase placeholder:normal-case placeholder:text-muted focus:outline-none"
          />
        </label>
        </form>
        <label className="flex h-10 items-center border border-line bg-panel">
          <span className="sr-only">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-full cursor-pointer bg-transparent px-3 font-pixel text-xs text-particle focus:outline-none">
            <option value="calls" className="bg-panel">Most called</option>
            <option value="minds" className="bg-panel">Most minds</option>
            <option value="recent" className="bg-panel">Called most recently</option>
            <option value="record" className="bg-panel">Best record (7 days)</option>
          </select>
        </label>
        <span className="font-pixel text-xs text-muted">{list.length.toLocaleString("en-US")} coins</span>
      </div>

      <div className="mt-4 overflow-x-auto border border-line" data-lenis-prevent>
        <table className="w-full min-w-[720px] text-left font-pixel text-xs">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2.5 font-normal">Coin</th>
              <th className="px-3 py-2.5 text-right font-normal">Calls</th>
              <th className="px-3 py-2.5 font-normal">Minds</th>
              <th className="px-3 py-2.5 font-normal">Latest call</th>
              <th className="px-3 py-2.5 font-normal">Where they stand</th>
              <th className="px-3 py-2.5 text-right font-normal">Worked 7d</th>
            </tr>
          </thead>
          <tbody className="text-particle">
            {list.slice(0, shown).map((c) => {
              const [k, n, ms, last, lm, ld, buy, sell, w7, n7, hold] = c;
              const dir = DIRS[ld];
              return (
                <tr key={k} className="border-b border-line transition-colors duration-fast last:border-0 hover:bg-panel">
                  <td className="px-3 py-2.5">
                    <AppLink href={`/coin/${encodeURIComponent(k)}`} className="text-ceramic hover:underline">
                      ${k}
                    </AppLink>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      {ms.slice(0, 6).map((m) => (
                        <i key={m} title={`@${minds[m].handle}`} className="inline-block h-2.5 w-2.5" style={{ background: minds[m].color }} />
                      ))}
                      <span className="ml-1 text-muted">{ms.length}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span style={{ color: dir === "buy" ? "var(--ii-verdict-buy)" : dir === "sell" ? "var(--ii-verdict-sell)" : "var(--ii-ceramic)" }}>{dir.toUpperCase()}</span>{" "}
                    <span className="text-muted tabular-nums">{dayOf(last)}</span> <span style={{ color: minds[lm].color }}>@{minds[lm].handle}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {buy + hold + sell ? (
                      [buy && `${buy} buy`, hold && `${hold} hold`, sell && `${sell} sell`].filter(Boolean).join(" · ")
                    ) : (
                      <span className="text-muted">quiet for 6 months+</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n7 ? `${w7}% of ${n7}` : <span className="text-muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown < list.length && (
        <button type="button" onClick={() => setShown((s) => s + PAGE)} className="btn-line mt-4 h-9 px-4 text-xs">
          Show {Math.min(PAGE, list.length - shown)} more
        </button>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted">&ldquo;Where they stand&rdquo; counts each mind&apos;s latest call on the coin from the last six months. Worked 7d: share of priced calls the price moved the call&apos;s way within a week.</p>
    </div>
  );
}
