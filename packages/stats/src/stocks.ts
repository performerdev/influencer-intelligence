/**
 * Daily closes for stocks, ETFs and metals ("stock:<symbol>" ids, see STOCKS
 * in coins.ts). Free, no key: Yahoo Finance's chart API (closes adjusted for
 * splits and dividends), with Stooq's CSV as a fallback.
 *
 * Markets close on weekends and holidays, so a call made on a Saturday is
 * priced at the last close before it, and a horizon that lands on a Sunday at
 * the last close before that — never a close from after the moment.
 */
import type { PricePoint, PriceSource } from "./prices";

const DAY = 86_400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const yahooBase = () => (process.env.YAHOO_BASE ?? "https://query1.finance.yahoo.com").replace(/\/$/, "");
const stooqBase = () => (process.env.STOOQ_BASE ?? "https://stooq.com").replace(/\/$/, "");
const UA = { "User-Agent": "Mozilla/5.0 (compatible; ii-stats/1.0; +https://ii.plus)", Accept: "application/json,text/csv,*/*" };

type Close = { day: number; price: number }; // day = unix day number of the session

async function get(url: string, tries = 3): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (res?.ok) return res;
    if (attempt + 1 >= tries || (res && res.status !== 429 && res.status < 500)) return null;
    await sleep((res?.status === 429 ? 10_000 : 2_000) * (attempt + 1));
  }
}

async function fromYahoo(symbol: string, from: number, to: number): Promise<Close[]> {
  const res = await get(`${yahooBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d&events=split`);
  const j: any = res ? await res.json().catch(() => null) : null;
  const r = j?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const adj: (number | null)[] = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return ts.map((t, i) => ({ day: Math.floor(t / DAY), price: Number(adj[i]) })).filter((c) => Number.isFinite(c.price) && c.price > 0);
}

/** Stooq symbols: "nvda.us"; futures and the dollar index have their own names. */
const STOOQ: Record<string, string> = { "GC=F": "xauusd", "SI=F": "xagusd", "CL=F": "cl.f", "DX-Y.NYB": "dx.f" };
async function fromStooq(symbol: string, from: number, to: number): Promise<Close[]> {
  const s = STOOQ[symbol] ?? `${symbol.toLowerCase().replace(/[^a-z0-9.-]/g, "")}.us`;
  const d = (t: number) => new Date(t * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const res = await get(`${stooqBase()}/q/d/l/?s=${encodeURIComponent(s)}&d1=${d(from)}&d2=${d(to)}&i=d`);
  const text = res ? await res.text().catch(() => "") : "";
  // Date,Open,High,Low,Close,Volume
  return text
    .split("\n")
    .slice(1)
    .map((l) => l.split(","))
    .map(([date, , , , close]) => ({ day: Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000 / DAY), price: Number(close) }))
    .filter((c) => Number.isFinite(c.day) && Number.isFinite(c.price) && c.price > 0);
}

/** The last close at or before `ts` (within 5 days: a long weekend plus a holiday). */
export function closeAt(closes: Close[], ts: number): PricePoint | null {
  const day = Math.floor(ts / DAY);
  let best: Close | null = null;
  for (const c of closes) if (c.day <= day && day - c.day <= 5 && (!best || c.day > best.day)) best = c;
  return best ? { timestamp: best.day * DAY + DAY - 1, price: best.price } : null;
}

export class StockPrices implements PriceSource {
  readonly name = "Yahoo Finance (stocks, ETFs, metals)";
  private delay = Number(process.env.STOCK_DELAY_MS ?? 600);

  async batch(req: Record<string, number[]>): Promise<Record<string, (PricePoint | null)[]>> {
    const out: Record<string, (PricePoint | null)[]> = {};
    for (const [id, tss] of Object.entries(req)) {
      out[id] = tss.map(() => null);
      const symbol = id.replace(/^stock:/, "");
      if (!tss.length) continue;
      const from = Math.min(...tss) - 7 * DAY;
      const to = Math.max(...tss) + DAY;
      let closes = await fromYahoo(symbol, from, to);
      if (!closes.length) closes = await fromStooq(symbol, from, to);
      await sleep(this.delay);
      out[id] = tss.map((ts) => closeAt(closes, ts));
    }
    return out;
  }
}
