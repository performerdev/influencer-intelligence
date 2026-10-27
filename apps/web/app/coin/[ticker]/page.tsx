import type { Metadata } from "next";

import { CoinCalls, type CoinCall } from "@/components/coin/CoinCalls";
import { CoinChart, type CoinPoint } from "@/components/coin/CoinChart";
import { CoinSearch } from "@/components/coin/CoinSearch";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { type Dir, day, money, share, signed, summary, tickerKey } from "@/lib/record";
import { livePrice, loadRecord, priceHistory } from "@/lib/server/record";

// Public and the same for everyone: cached, rebuilt at most every 10 minutes.
export const revalidate = 600;

type Props = { params: Promise<{ ticker: string }> };
const DAY = 864e5;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = tickerKey(decodeURIComponent((await params).ticker));
  return {
    title: `$${t}: what CT called`,
    description: `Every public call on $${t} by the minds on Influencer Intelligence: who called it, when, at what price, and how it played out. Not financial advice.`,
  };
}

const mode = (xs: string[]) => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

function DirChip({ dir }: { dir: Dir }) {
  const color = dir === "buy" ? "var(--ii-verdict-buy)" : dir === "sell" ? "var(--ii-verdict-sell)" : "var(--ii-ceramic)";
  return (
    <span className="inline-flex h-6 items-center rounded-pill border px-2 font-mono text-[11px] tracking-[0.08em]" style={{ color, borderColor: dir === "hold" ? "var(--ii-line-hover)" : `color-mix(in srgb, ${color} 45%, transparent)` }}>
      {dir.toUpperCase()}
    </span>
  );
}

/**
 * "What does CT think about $X": every mind's calls on one coin — who was
 * early and at what price, where each mind stands now, every call on the price
 * chart, and the full list. Numbers come from the priced call record.
 */
export default async function CoinPage({ params }: Props) {
  const T = tickerKey(decodeURIComponent((await params).ticker));
  // no database (a build without one): an empty record, filled on the next revalidate
  const rec = await loadRecord().catch(() => ({ minds: [], rows: [], computedAt: null }) as Awaited<ReturnType<typeof loadRecord>>);
  let rows = rec.rows.filter((r) => r.ticker === T);

  // one ticker can name several coins: keep the coin most calls were priced as
  const pid = mode(rows.filter((r) => r.pid && r.match !== 1).map((r) => r.pid!)) ?? mode(rows.filter((r) => r.pid).map((r) => r.pid!));
  const others = pid ? rows.filter((r) => r.pid && r.pid !== pid).length : 0;
  if (pid) rows = rows.filter((r) => !r.pid || r.pid === pid);

  const minds = rec.minds;
  if (!rows.length) {
    return (
      <div className="mx-auto max-w-[1100px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
        <p className="label-mono">Coin</p>
        <h1 className="mt-1 text-h2">${T}</h1>
        <p className="mt-3 max-w-[60ch] text-body text-particle">None of the {minds.length} minds has called ${T} in their posts yet.</p>
        <div className="mt-6 max-w-[420px]">
          <CoinSearch />
        </div>
        <AppLink href="/coins" className="link-quiet mt-6 inline-block text-sm">
          The coins CT calls most <span className="arrow">↗</span>
        </AppLink>
      </div>
    );
  }

  const first = rows[0];
  const [live, history] = pid ? await Promise.all([livePrice(pid), priceHistory(pid, first.t - 14 * DAY)]) : [null, [] as [number, number][]];

  // per mind: who was early, how they did on this coin, where they stand now
  const byMind = new Map<number, typeof rows>();
  for (const r of rows) byMind.set(r.m, [...(byMind.get(r.m) ?? []), r]);
  const cards = [...byMind.entries()]
    .map(([m, rs]) => {
      const firstPriced = rs.find((r) => r.price != null) ?? null;
      const last = rs[rs.length - 1];
      return {
        m,
        it: minds[m],
        n: rs.length,
        first: rs[0],
        last,
        stale: Date.now() - last.t > 180 * DAY,
        since: live && firstPriced?.price ? live.price / firstPriced.price - 1 : null,
        firstPriced,
        ...summary(rs),
      };
    })
    .sort((a, b) => a.first.t - b.first.t);
  const stance = { buy: 0, hold: 0, sell: 0 };
  for (const c of cards) if (!c.stale) stance[c.last.dir]++;
  const stale = cards.filter((c) => c.stale).length;

  const points: CoinPoint[] = rows.filter((r) => r.price != null).map((r) => ({ t: r.t, m: r.m, dir: r.dir, price: r.price!, r7: r.r7, r30: r.r30, quote: r.quote, post: r.post }));
  const list: CoinCall[] = rows.map((r) => ({ t: r.t, m: r.m, dir: r.dir, price: r.price, r7: r.r7, r30: r.r30, quote: r.quote, post: r.post, approx: r.match === 1 }));
  const chartMinds = minds.map((i) => ({ code: i.code, handle: i.handle, color: i.color }));
  const ask = [...cards].sort((a, b) => b.n - a.n).slice(0, 4).map((c) => c.it.handle);
  const all = summary(rows);

  return (
    <div className="mx-auto max-w-[1100px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="label-mono">Coin · what CT called</p>
          <h1 className="mt-1 break-words text-h1">${T}</h1>
          <p className="mt-3 font-pixel text-body text-particle">
            {live ? (
              <>
                <span className="text-ceramic">{money(live.price)}</span>
                {live.change24h != null && <span className={live.change24h >= 0 ? "text-ceramic" : "text-muted"}> {`${live.change24h >= 0 ? "+" : "−"}${Math.abs(live.change24h).toFixed(1)}%`} 24h</span>}
                <span className="text-muted"> · </span>
              </>
            ) : null}
            {rows.length} {rows.length === 1 ? "call" : "calls"} from {cards.length} {cards.length === 1 ? "mind" : "minds"} · first called {day(first.t)} by{" "}
            <span style={{ color: minds[first.m].color }}>@{minds[first.m].handle}</span>
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <AppLink href={`/group?with=${encodeURIComponent(ask.join(","))}`} className="btn-ceramic">
              Ask {ask.length > 1 ? "them" : `@${ask[0]}`} about ${T}
            </AppLink>
            <AppLink href="/coins" className="link-quiet text-sm">
              All coins <span className="arrow">↗</span>
            </AppLink>
          </div>
        </div>
        <div className="w-full md:max-w-[340px]">
          <CoinSearch />
        </div>
      </header>

      {/* where they stand */}
      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3">Who called it first, and where they stand</h2>
          <p className="font-pixel text-xs text-muted">
            {stale === cards.length ? (
              "Nobody has called it in the last 6 months"
            ) : (
              <>
                Latest calls: <span className="text-ceramic">{stance.buy} buy</span> · {stance.hold} hold · <span className="text-ceramic">{stance.sell} sell</span>
                {stale ? ` · ${stale} quiet for 6 months+` : ""}
              </>
            )}
          </p>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => (
            <li key={c.m} className="rounded-panel border border-line bg-panel p-4">
              <div className="flex items-center gap-3">
                <BrainAvatar it={c.it} size={36} />
                <div className="min-w-0">
                  <p className="font-mono text-[10px]" style={{ color: c.it.color }}>
                    {i === 0 ? "first to call it" : `#${i + 1} to call it`}
                  </p>
                  <AppLink href={`/brain/${encodeURIComponent(c.it.handle)}#calls`} className="block truncate font-pixel text-sm hover:underline">
                    @{c.it.handle}
                  </AppLink>
                </div>
                <span className="ml-auto shrink-0 text-right">
                  <DirChip dir={c.last.dir} />
                  <span className="mt-1 block font-pixel text-[10px] text-muted">{c.stale ? `quiet since ${day(c.last.t).slice(0, 7)}` : `latest ${day(c.last.t)}`}</span>
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 font-pixel">
                <div>
                  <dt className="text-[10px] text-muted">First call</dt>
                  <dd className="mt-0.5 text-xs tabular-nums">{day(c.first.t)}</dd>
                  <dd className="text-[11px] text-particle tabular-nums">{c.firstPriced ? `at ${money(c.firstPriced.price)}` : "no price"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted">Since then</dt>
                  <dd className={`mt-0.5 text-sm tabular-nums ${c.since != null && c.since > 0 ? "text-ceramic" : "text-muted"}`}>{signed(c.since)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted">{c.n} calls · 7d</dt>
                  <dd className="mt-0.5 text-sm tabular-nums">{c.n7 ? share(c.w7) : "—"}</dd>
                  <dd className="text-[11px] text-particle tabular-nums">{c.n7 ? `median ${signed(c.m7)}` : "not priced"}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {/* chart */}
      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3">Every call on the price</h2>
          <p className="font-pixel text-xs text-muted">
            All minds: worked after 7 days {share(all.w7)} (n={all.n7}) · after 30 days {share(all.w30)} (n={all.n30})
          </p>
        </div>
        <div className="mt-5 rounded-panel border border-line bg-panel p-4 sm:p-5">
          <CoinChart ticker={T} history={history} calls={points} minds={chartMinds} />
        </div>
      </section>

      {/* every call */}
      <section className="mt-12">
        <h2 className="text-h3">All calls on ${T}</h2>
        <div className="mt-5">
          <CoinCalls calls={list} minds={chartMinds} />
        </div>
      </section>

      <p className="mt-12 text-xs leading-relaxed text-muted">
        Calls are what each person said in public posts on X, found by the brain build and priced by code
        {pid ? ` (${pid.startsWith("coingecko:") ? "DefiLlama" : pid.startsWith("stock:") ? "daily closes" : "DefiLlama by contract address"})` : ""}. &ldquo;Since then&rdquo; compares today&apos;s price with the price at that mind&apos;s first priced call. ~ means the coin was matched by its ticker alone.
        {others ? ` ${others} calls on other coins named $${T} are left out.` : ""} Unofficial; not financial advice.
      </p>
    </div>
  );
}
