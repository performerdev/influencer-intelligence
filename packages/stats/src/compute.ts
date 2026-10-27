import { priceIds } from "./coins";
import type { PricePoint, PriceSource } from "./prices";

export type CallInput = {
  post_id: string;
  ticker: string;
  chain: string | null;
  address: string | null;
  direction: "buy" | "sell" | "hold";
  called_at: Date;
};

const HORIZONS = { "1d": 1, "7d": 7, "30d": 30 } as const;
type Horizon = keyof typeof HORIZONS;

export type CallStat = {
  post_id: string;
  ticker: string;
  direction: string;
  called_at: string;
  price_id: string | null;
  price_at_call: number | null;
  /** price change after N days, signed in the call's favor (a sell that's followed by a drop is positive) */
  r_1d: number | null;
  r_7d: number | null;
  r_30d: number | null;
  /**
   * How the asset was found when the post named no exact id. "ticker": by its ticker on DexScreener;
   * "symbol": by its symbol in CoinGecko's full list — both may be a namesake. "stock": a stock, ETF or metal.
   */
  matched_by?: "ticker" | "symbol" | "stock" | null;
  /** the token's own symbol, when the call only named it by contract address ("CA") */
  symbol?: string | null;
};

export type HorizonStat = { n: number; median_return: number | null; mean_return: number | null; hit_rate: number | null };

export type Stats = {
  computed_at: string;
  price_source: string;
  calls_total: number;
  calls_priced: number;
  by_direction: Record<"buy" | "sell" | "hold", number>;
  horizons: Record<Horizon, HorizonStat>;
  median_hold_days: number | null;
  hold_pairs: number;
  per_call: CallStat[];
  notes: string[];
};

const DAY = 86_400;
const round = (x: number | null, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Deterministic stats from calls + historical prices. No model involved:
 * every number here is computed, and the whole object is stamped with
 * computed_at.
 */
export async function computeStats(
  calls: CallInput[],
  prices: PriceSource,
  now = new Date(),
  opts: {
    /** more candidate ids per call, best first (tokens resolved by address, ticker or symbol) */
    extraIds?: (c: CallInput) => string[];
    /** where "gt:" ids are priced, for calls the main source couldn't price */
    fallback?: PriceSource;
    /** other sources by id prefix, e.g. { prefix: "stock:", source: new StockPrices() } */
    sources?: { prefix: string; source: PriceSource }[];
    /** how the priced id was found (default: "stock" for stock ids, "ticker" for any id the call didn't name) */
    matchedBy?: (c: CallInput, id: string) => CallStat["matched_by"];
    /** the real symbol for a call named only by its contract address */
    symbolOf?: (c: CallInput, id: string) => string | null;
  } = {},
): Promise<Stats> {
  const nowSec = Math.floor(now.getTime() / 1000);
  // Request every candidate id at call time + each horizon (future points skipped).
  const req: Record<string, number[]> = {};
  const plan = calls.map((c) => {
    const t0 = Math.floor(new Date(c.called_at).getTime() / 1000);
    const ts = [t0, ...Object.values(HORIZONS).map((d) => t0 + d * DAY)].filter((t) => t <= nowSec);
    const known = priceIds(c);
    const ids = known.length ? known : (opts.extraIds?.(c) ?? []);
    for (const id of ids) if (!id.startsWith("gt:")) req[id] = [...new Set([...(req[id] ?? []), ...ts])].sort((a, b) => a - b);
    return { c, t0, ts, ids };
  });
  // each id goes to the source that knows it: stocks to the stock source, the rest to the main one
  const routes = opts.sources ?? [];
  const groups = new Map<PriceSource, Record<string, number[]>>();
  for (const [id, ts] of Object.entries(req)) {
    const src = routes.find((r) => id.startsWith(r.prefix))?.source ?? prices;
    groups.set(src, { ...(groups.get(src) ?? {}), [id]: ts });
  }
  const got: Record<string, (PricePoint | null)[]> = {};
  for (const [src, part] of groups) Object.assign(got, await src.batch(part));
  const lookup = (id: string, ts: number) => {
    const i = req[id]?.indexOf(ts) ?? -1;
    return i >= 0 ? got[id]?.[i]?.price ?? null : null;
  };
  // second pass, only for calls the main source couldn't price: the fallback ("gt:" pool candles)
  if (opts.fallback) {
    const more: Record<string, number[]> = {};
    for (const { t0, ts, ids } of plan) {
      if (ids.some((x) => !x.startsWith("gt:") && lookup(x, t0) != null)) continue;
      for (const id of ids.filter((x) => x.startsWith("gt:"))) more[id] = [...new Set([...(more[id] ?? []), ...ts])].sort((a, b) => a - b);
    }
    if (Object.keys(more).length) {
      const extra = await opts.fallback.batch(more);
      for (const [id, tss] of Object.entries(more)) {
        req[id] = tss;
        got[id] = extra[id] ?? tss.map(() => null);
      }
    }
  }

  // A coin's first hours of trading often carry a placeholder price (a launch-day $0.0001 for a $1 coin):
  // a 20x jump either way between the call and the next day is bad data, not a move. Try the next candidate.
  const sane = (id: string, t0: number) => {
    const p0 = lookup(id, t0);
    if (p0 == null) return false;
    const p1 = lookup(id, t0 + DAY);
    return p1 == null || (p1 / p0 < 20 && p0 / p1 < 20);
  };
  const per_call: CallStat[] = plan.map(({ c, t0, ids }) => {
    const id = ids.find((x) => sane(x, t0)) ?? null;
    const p0 = id ? lookup(id, t0) : null;
    const sign = c.direction === "sell" ? -1 : 1;
    const r = (d: number) => {
      if (!id || !p0) return null;
      const p = lookup(id, t0 + d * DAY);
      return p == null ? null : round(sign * (p / p0 - 1));
    };
    return {
      post_id: c.post_id,
      ticker: c.ticker,
      direction: c.direction,
      called_at: new Date(c.called_at).toISOString(),
      price_id: id,
      price_at_call: p0,
      matched_by: !id ? null : opts.matchedBy ? opts.matchedBy(c, id) : id.startsWith("stock:") ? "stock" : priceIds(c).includes(id) ? null : "ticker",
      symbol: id && opts.symbolOf ? opts.symbolOf(c, id) : null,
      r_1d: r(1),
      r_7d: r(7),
      r_30d: r(30),
    };
  });

  const horizons = Object.fromEntries(
    (Object.keys(HORIZONS) as Horizon[]).map((h) => {
      const xs = per_call.map((p) => p[`r_${h}` as const]).filter((x): x is number => x != null);
      return [
        h,
        {
          n: xs.length,
          median_return: round(median(xs)),
          mean_return: xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null,
          hit_rate: xs.length ? round(xs.filter((x) => x > 0).length / xs.length) : null,
        },
      ];
    }),
  ) as Record<Horizon, HorizonStat>;

  // Hold time: a buy followed by the first later sell of the same ticker.
  const holds: number[] = [];
  const byTicker = new Map<string, CallInput[]>();
  for (const c of calls) byTicker.set(c.ticker, [...(byTicker.get(c.ticker) ?? []), c]);
  for (const list of byTicker.values()) {
    const sorted = [...list].sort((a, b) => new Date(a.called_at).getTime() - new Date(b.called_at).getTime());
    let open: CallInput | null = null;
    for (const c of sorted) {
      if (c.direction === "buy" && !open) open = c;
      else if (c.direction === "sell" && open) {
        holds.push((new Date(c.called_at).getTime() - new Date(open.called_at).getTime()) / (DAY * 1000));
        open = null;
      }
    }
  }

  const by_direction = { buy: 0, sell: 0, hold: 0 };
  for (const c of calls) by_direction[c.direction]++;

  return {
    computed_at: now.toISOString(),
    price_source: [
      opts.extraIds ? `${prices.name}, small coins found on DexScreener${opts.fallback ? ` (+ ${opts.fallback.name})` : ""}` : prices.name,
      ...routes.map((r) => r.source.name),
    ].join("; "),
    calls_total: calls.length,
    calls_priced: per_call.filter((p) => p.price_at_call != null).length,
    by_direction,
    horizons,
    median_hold_days: round(median(holds), 1),
    hold_pairs: holds.length,
    per_call,
    notes: [
      "Returns are signed in the call's favor: a sell call followed by a price drop counts as positive.",
      "hold calls are measured like buys.",
      "A price that jumps 20x either way within a day of the call is treated as launch-day bad data and the call is left unpriced.",
      "Calls without a known asset id or contract address in the post are matched by ticker (DexScreener) or symbol (CoinGecko) to a coin that already traded on the call's date; those matches are marked and may be a namesake.",
      "Stocks, ETFs and metals are priced from daily closes adjusted for splits; a call on a closed day uses the last close before it.",
      "Hold time pairs a buy with the next sell of the same ticker; only calls with an exit post count.",
    ],
  };
}
