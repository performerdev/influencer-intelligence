import type { CardCall, CoinCardData, CompareCardData, RecordCardData } from "@/lib/cards";
import { summary, tickerKey } from "@/lib/record";
import { json } from "@/lib/server/http";
import { type CTRecord, loadRecord, priceHistory } from "@/lib/server/record";
import { lookupToken } from "@/lib/server/token";

export const runtime = "nodejs";
export const maxDuration = 20;

const DAY = 864e5;
// the same for everyone; prices move, the record changes once a week
// Netlify's edge leaves the query out of the cache key unless told: without Netlify-Vary every card got the first one cached
const CACHE = {
  "Cache-Control": "public, max-age=60",
  "Netlify-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
  "Netlify-Vary": "query=coin|compare|record",
};
const ok = (data: unknown) => Response.json(data, { headers: CACHE });

type Row = CTRecord["rows"][number];

const mode = (xs: string[]) => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const call = (r: Row): CardCall => ({ t: r.t, dir: r.dir, price: r.price, r7: r.r7, r30: r.r30, quote: r.quote, post: r.post, approx: r.match === 1 });

/** The coin a ticker means for this mind: what its own calls were priced as, else what most minds' were. */
function coinOf(rec: CTRecord, m: number, T: string) {
  const all = rec.rows.filter((r) => r.ticker === T);
  const mine = all.filter((r) => r.m === m);
  const pick = (rs: Row[]) => mode(rs.filter((r) => r.pid && r.match !== 1).map((r) => r.pid!)) ?? mode(rs.filter((r) => r.pid).map((r) => r.pid!));
  const pid = pick(mine) ?? pick(all);
  return { pid, mine: pid ? mine.filter((r) => !r.pid || r.pid === pid) : mine };
}

async function coin(rec: CTRecord, m: number, T: string, lite: boolean) {
  const { pid, mine } = coinOf(rec, m, T);
  const token = await lookupToken(T, [], pid?.startsWith("stock:") ? null : pid).catch(() => null);
  const hid = pid && !pid.startsWith("stock:") ? pid : token?.pid ?? null;
  const from = mine.length ? mine[0].t - 14 * DAY : Date.now() - 365 * DAY;
  const history = lite || !hid ? [] : await priceHistory(hid, from).catch(() => []);
  return { token, history, mine };
}

/**
 * Data for the cards a mind draws inside its answers: one coin with the
 * mind's calls on it (?coin=WIF), coins side by side (?compare=WIF,BONK), or
 * the mind's whole record (?record=1). Public, numbers from the call record
 * and live sources only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const handle = decodeURIComponent((await params).handle).replace(/^@/, "").toLowerCase();
  const q = new URL(req.url).searchParams;
  const rec = await loadRecord().catch(() => null);
  const m = rec ? rec.minds.findIndex((i) => i.handle.toLowerCase() === handle) : -1;
  if (!rec || m < 0) return json({ error: "No such mind." }, 404);

  const coinQ = q.get("coin");
  if (coinQ) {
    const T = tickerKey(coinQ);
    if (!/^[A-Z0-9]{1,15}$/.test(T)) return json({ error: "Bad ticker." }, 400);
    const { token, history, mine } = await coin(rec, m, T, false);
    const data: CoinCardData = { ticker: T, token, history, calls: mine.map(call), sum: summary(mine) };
    return ok(data);
  }

  const cmp = q.get("compare");
  if (cmp) {
    const ts = [...new Set(cmp.split(",").map(tickerKey).filter((t) => /^[A-Z0-9]{1,15}$/.test(t)))].slice(0, 4);
    if (ts.length < 2) return json({ error: "Two to four tickers." }, 400);
    const rows = await Promise.all(
      ts.map(async (T) => {
        const { token, mine } = await coin(rec, m, T, true);
        const last = mine[mine.length - 1];
        return {
          ticker: T,
          token: token ? { price: token.price, change24h: token.change24h, mcap: token.mcap, top: token.top } : null,
          n: mine.length,
          last: last ? { dir: last.dir, t: last.t } : null,
          sum: summary(mine),
        };
      }),
    );
    const data: CompareCardData = { rows };
    return ok(data);
  }

  if (q.has("record")) {
    const mine = rec.rows.filter((r) => r.m === m);
    const recent = mine.filter((r) => r.t >= Date.now() - 30 * DAY);
    const counts = new Map<string, Row[]>();
    // "CA" is a contract-only call the stats step couldn't name
    for (const r of mine) if (r.ticker !== "CA") counts.set(r.ticker, [...(counts.get(r.ticker) ?? []), r]);
    const top = [...counts.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .map(([ticker, rs]) => ({ ticker, n: rs.length, w7: summary(rs).w7 }));
    // best and worst by the 30-day move, exact matches only (a namesake's pump isn't the mind's call)
    const scored = mine.filter((r) => r.r30 != null && r.match !== 1).sort((a, b) => b.r30! - a.r30!);
    const data: RecordCardData = {
      n: mine.length,
      priced: mine.filter((r) => r.price != null).length,
      all: summary(mine),
      d30: { ...summary(recent), n: recent.length },
      top,
      best: scored.slice(0, 3).filter((r) => r.r30! > 0).map((r) => ({ ...call(r), ticker: r.ticker })),
      worst: scored.slice(3).slice(-2).reverse().filter((r) => r.r30! < 0).map((r) => ({ ...call(r), ticker: r.ticker })),
    };
    return ok(data);
  }

  return json({ error: "Ask for ?coin=, ?compare= or ?record=1." }, 400);
}
