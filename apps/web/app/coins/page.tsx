import type { Metadata } from "next";

import { type CoinRow, CoinsIndex } from "@/components/coin/CoinsIndex";
import { summary } from "@/lib/record";
import { loadRecord } from "@/lib/server/record";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Coins CT calls",
  description: "Every coin the minds on Influencer Intelligence called in public posts: who called it, where they stand now, and how the calls played out.",
};

const DAY = 864e5;

export default async function CoinsPage() {
  // no database (a build without one): an empty record, filled on the next revalidate
  const rec = await loadRecord().catch(() => ({ minds: [], rows: [], computedAt: null }) as Awaited<ReturnType<typeof loadRecord>>);
  const groups = new Map<string, typeof rec.rows>();
  for (const r of rec.rows) groups.set(r.ticker, [...(groups.get(r.ticker) ?? []), r]);
  const recent = Date.now() - 180 * DAY;
  const coins: CoinRow[] = [...groups.entries()]
    .filter(([k]) => k !== "CA")
    .map(([k, rs]) => {
      const perMind = new Map<number, number>();
      const latest = new Map<number, (typeof rs)[number]>();
      for (const r of rs) {
        perMind.set(r.m, (perMind.get(r.m) ?? 0) + 1);
        latest.set(r.m, r); // rows are oldest first
      }
      const last = rs[rs.length - 1];
      const now = [...latest.values()].filter((r) => r.t >= recent);
      const s = summary(rs);
      return [
        k,
        rs.length,
        [...perMind.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m),
        Math.floor(last.t / DAY),
        last.m,
        last.dir === "buy" ? "b" : last.dir === "sell" ? "s" : "h",
        now.filter((r) => r.dir === "buy").length,
        now.filter((r) => r.dir === "sell").length,
        s.w7 == null ? -1 : Math.round(s.w7 * 100),
        s.n7,
        now.filter((r) => r.dir === "hold").length,
      ] as CoinRow;
    });
  const minds = rec.minds.map((i) => ({ code: i.code, handle: i.handle, color: i.color }));

  return (
    <div className="mx-auto max-w-[1100px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <p className="label-mono">Coins</p>
      <h1 className="mt-1 text-h2">What CT called</h1>
      <p className="mt-3 max-w-[62ch] text-body text-particle">
        Look up any coin to see which minds called it, who was first and at what price, where each of them stands now, and how every call played out.
      </p>
      <div className="mt-8">
        <CoinsIndex coins={coins} minds={minds} />
      </div>
    </div>
  );
}
