"use client";

import { useMemo, useState } from "react";

import { type Dir, day, money, signed } from "@/lib/record";

import type { ChartMind } from "./CoinChart";

export type CoinCall = { t: number; m: number; dir: Dir; price: number | null; r7: number | null; r30: number | null; quote: string; post: string; approx: boolean };

const PAGE = 40;
const tone = (r: number | null) => (r == null ? "text-muted" : r > 0 ? "text-ceramic" : "text-muted");

function DirChip({ dir }: { dir: Dir }) {
  const color = dir === "buy" ? "var(--ii-verdict-buy)" : dir === "sell" ? "var(--ii-verdict-sell)" : "var(--ii-ceramic)";
  return (
    <span className="inline-flex h-6 items-center rounded-pill border px-2 font-mono text-[11px] tracking-[0.08em]" style={{ color, borderColor: dir === "hold" ? "var(--ii-line-hover)" : `color-mix(in srgb, ${color} 45%, transparent)` }}>
      {dir.toUpperCase()}
    </span>
  );
}

/** Every call on one coin, newest first, filterable by mind. */
export function CoinCalls({ calls, minds }: { calls: CoinCall[]; minds: ChartMind[] }) {
  const [who, setWho] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);
  const present = useMemo(() => [...new Set(calls.map((c) => c.m))], [calls]);
  const list = useMemo(() => calls.filter((c) => who == null || c.m === who).sort((a, b) => b.t - a.t), [calls, who]);

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Mind">
        {[null, ...present].map((m) => (
          <button
            key={m ?? "all"}
            type="button"
            aria-pressed={who === m}
            onClick={() => {
              setWho(m);
              setShown(PAGE);
            }}
            className={`border px-2.5 py-1 font-pixel text-xs transition-colors duration-fast ${who === m ? "border-ceramic bg-particle text-void" : "border-line text-muted hover:text-ceramic"}`}
          >
            {m == null ? `All minds · ${calls.length}` : `@${minds[m].handle} · ${calls.filter((c) => c.m === m).length}`}
          </button>
        ))}
      </div>

      <div className="mt-4 border border-line">
        <div className="hidden grid-cols-[92px_minmax(0,160px)_60px_minmax(0,1fr)_76px_76px_20px] gap-x-3 border-b border-line px-4 py-2.5 font-pixel text-[11px] text-muted sm:grid">
          <span>Date</span>
          <span>Mind</span>
          <span>Call</span>
          <span className="text-right">Price at call</span>
          <span className="text-right">7 days</span>
          <span className="text-right">30 days</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {list.slice(0, shown).map((c) => {
            const it = minds[c.m];
            const url = `https://x.com/${it.handle}/status/${c.post}`;
            return (
              <li key={`${c.m}-${c.post}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 font-pixel text-xs sm:grid-cols-[92px_minmax(0,160px)_60px_minmax(0,1fr)_76px_76px_20px]">
                <span className="order-3 text-right text-muted tabular-nums sm:order-none sm:text-left">{day(c.t)}</span>
                <a href={`/brain/${encodeURIComponent(it.handle)}#calls`} className="order-2 min-w-0 truncate hover:underline sm:order-none" style={{ color: it.color }}>
                  @{it.handle}
                </a>
                <span className="order-1 sm:order-none">
                  <DirChip dir={c.dir} />
                </span>
                <span className="hidden text-right text-particle tabular-nums sm:block">
                  {money(c.price)}
                  {c.approx && c.price != null ? <span className="text-muted" title="Matched by name only"> ~</span> : null}
                </span>
                <span className={`hidden text-right tabular-nums sm:block ${tone(c.r7)}`}>{signed(c.r7)}</span>
                <span className={`hidden text-right tabular-nums sm:block ${tone(c.r30)}`}>{signed(c.r30)}</span>
                <a href={url} target="_blank" rel="noreferrer" className="link-quiet hidden justify-self-end sm:block" aria-label="Open the post on X">
                  <span className="arrow">↗</span>
                </a>
                <p className="order-4 col-span-3 flex flex-wrap gap-x-3 text-particle tabular-nums sm:hidden">
                  <span>at {money(c.price)}</span>
                  <span className={tone(c.r7)}>7d {signed(c.r7)}</span>
                  <span className={tone(c.r30)}>30d {signed(c.r30)}</span>
                  <a href={url} target="_blank" rel="noreferrer" className="link-quiet ml-auto">
                    Post <span className="arrow">↗</span>
                  </a>
                </p>
                {c.quote && <p className="order-5 col-span-3 line-clamp-2 font-sans text-sm text-particle sm:order-none sm:col-span-7 sm:line-clamp-1 sm:pl-[104px]">“{c.quote}”</p>}
              </li>
            );
          })}
        </ul>
      </div>
      {shown < list.length && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-line mt-4 h-9 px-4 text-xs">
          Show {Math.min(PAGE, list.length - shown)} more
        </button>
      )}
    </div>
  );
}
