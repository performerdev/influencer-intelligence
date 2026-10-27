import type { Metadata } from "next";

import { type BoardRow, Leaderboard } from "@/components/leaderboard/Leaderboard";
import { kindOf } from "@/lib/record";
import { loadRecord } from "@/lib/server/record";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Who on Crypto Twitter calls best: every public call by the minds on Influencer Intelligence, priced 7 and 30 days later. Not financial advice.",
};

export default async function LeaderboardPage() {
  // no database (a build without one): an empty record, filled on the next revalidate
  const rec = await loadRecord().catch(() => ({ minds: [], rows: [], computedAt: null }) as Awaited<ReturnType<typeof loadRecord>>);
  const tickers: string[] = [];
  const index = new Map<string, number>();
  const rows: BoardRow[] = [];
  for (const r of rec.rows) {
    if (r.r7 == null && r.r30 == null) continue;
    if (!index.has(r.ticker)) index.set(r.ticker, tickers.push(r.ticker) - 1);
    const k = kindOf(r);
    rows.push([r.m, Math.floor(r.t / 864e5), k === "major" ? 0 : k === "alt" ? 1 : 2, r.r7, r.r30, index.get(r.ticker)!, r.post]);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <p className="label-mono">Leaderboard</p>
      <h1 className="mt-1 text-h2">Who calls best</h1>
      <p className="mt-3 max-w-[64ch] text-body text-particle">
        Every buy, hold and sell each mind posted on X, priced by code 7 and 30 days later. A call worked if the price moved its way: a sell followed by a drop counts.
      </p>
      <div className="mt-8">
        <Leaderboard rows={rows} tickers={tickers} minds={rec.minds} />
      </div>
      <p className="mt-12 text-xs leading-relaxed text-muted">
        Prices from DefiLlama, DexScreener and daily stock closes{rec.computedAt ? `, computed ${rec.computedAt.slice(0, 10)}` : ""}. Calls on coins with no price history aren&apos;t counted. Past calls say nothing certain about future ones. Unofficial; not financial advice.
      </p>
    </div>
  );
}
