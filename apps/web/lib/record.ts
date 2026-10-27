/**
 * One call as every record page shows it: a mind's call from its brain files,
 * joined with the price the stats step computed for it. Pure functions, shared
 * by the mind page, the coin page and the leaderboard.
 */
// coins.ts alone: the record helpers also run in the browser
import { isNotCoin } from "@ii/stats/src/coins";

export type Dir = "buy" | "sell" | "hold";
/** how the asset was found: 0 exact, 1 by ticker or symbol only (may be a namesake), 2 a stock / ETF / metal */
export type Match = 0 | 1 | 2;
export type RecordRow = {
  /** ms */
  t: number;
  ticker: string;
  dir: Dir;
  post: string;
  quote: string;
  price: number | null;
  /** moves 7 and 30 days later, signed in the call's favor */
  r7: number | null;
  r30: number | null;
  match: Match;
  /** the price id the move was computed from ("coingecko:…", "solana:…", "stock:…") */
  pid: string | null;
};

type FileCall = { post_id: string; ticker: string; direction: Dir; called_at: string | Date; quote?: string | null };
type PerCall = { post_id: string; ticker: string; price_id?: string | null; price_at_call: number | null; r_7d: number | null; r_30d: number | null; matched_by?: string | null; symbol?: string | null };

export const tickerKey = (t: string) => t.replace(/^\$/, "").trim().toUpperCase();
// quotes come from X's API with HTML entities
export const unescapeQuote = (s: string) => s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const r4 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 1e4) / 1e4);

/** Every call on an asset, oldest first, with its price and moves where the stats step found them. */
export function recordRows(calls: FileCall[] | null | undefined, perCall: PerCall[] | null | undefined): RecordRow[] {
  const per = new Map<string, PerCall>();
  for (const p of perCall ?? []) {
    per.set(`${p.post_id}|${tickerKey(p.ticker)}`, p);
    if (!per.has(p.post_id)) per.set(p.post_id, p);
  }
  return (calls ?? [])
    .filter((c) => !isNotCoin(c.ticker))
    .map((c) => {
      const p = per.get(`${c.post_id}|${tickerKey(c.ticker)}`) ?? per.get(c.post_id);
      const price = p?.price_at_call ?? null;
      return {
        t: new Date(c.called_at).getTime(),
        ticker: tickerKey(p?.symbol ?? c.ticker),
        dir: c.direction,
        post: c.post_id,
        quote: unescapeQuote(c.quote ?? "").slice(0, 200),
        price: price == null ? null : Number(price.toPrecision(5)),
        r7: price == null ? null : r4(p?.r_7d),
        r30: price == null ? null : r4(p?.r_30d),
        match: (p?.matched_by === "stock" ? 2 : p?.matched_by === "ticker" || p?.matched_by === "symbol" ? 1 : 0) as Match,
        pid: price == null ? null : (p?.price_id ?? null),
      };
    })
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

/** Large caps: the "majors" filter on the leaderboard. Everything else priced on-chain or by name is an alt or a meme. */
export const MAJORS = new Set(
  "BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT TRX TON LTC BCH NEAR APT SUI HYPE ATOM UNI AAVE ARB OP MATIC POL TAO ETC XLM XMR FIL ICP HBAR ALGO VET".split(" "),
);
export type Kind = "major" | "alt" | "stock";
export const kindOf = (r: Pick<RecordRow, "ticker" | "match">): Kind => (r.match === 2 ? "stock" : MAJORS.has(r.ticker) ? "major" : "alt");

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Worked share and median move over the calls that have a move at that horizon. */
export function summary(rows: Pick<RecordRow, "r7" | "r30">[]) {
  const r7 = rows.map((r) => r.r7).filter((x): x is number => x != null);
  const r30 = rows.map((r) => r.r30).filter((x): x is number => x != null);
  return {
    n7: r7.length,
    w7: r7.length ? r7.filter((x) => x > 0).length / r7.length : null,
    m7: median(r7),
    n30: r30.length,
    w30: r30.length ? r30.filter((x) => x > 0).length / r30.length : null,
    m30: median(r30),
  };
}

export const share = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
export const signed = (r: number | null) => {
  if (r == null) return "—";
  const a = Math.abs(r * 100);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${a >= 100 ? a.toFixed(0) : a.toFixed(1)}%`;
};
export const money = (n: number | null) => {
  if (n == null || !(n > 0)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  // three significant digits, never exponent notation
  return `$${n.toFixed(Math.min(12, 2 - Math.floor(Math.log10(n))))}`;
};
export const day = (t: number) => new Date(t).toISOString().slice(0, 10);
