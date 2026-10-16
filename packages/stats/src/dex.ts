/**
 * Prices for coins the big lists don't know — mostly memecoins called by
 * ticker only ("aped $POPCAT").
 *
 *   1. DexScreener (free, no key) turns the ticker into a token: pairs whose
 *      base symbol is exactly the ticker, grouped by token, only tokens that
 *      already traded when the call was made (so a 2025 copycat never stands
 *      in for the 2023 coin), the most liquid one wins.
 *   2. DefiLlama prices that token by address, with its full history.
 *   3. GeckoTerminal (free, no key) fills in from the pool's daily candles
 *      when DefiLlama has nothing; its free API only reaches back ~6 months.
 *
 * Every price id this file makes says where it came from: "solana:<mint>"
 * (DefiLlama) or "gt:<network>:<pool>" (GeckoTerminal).
 */
import { COINGECKO_IDS } from "./coins";
import type { PricePoint, PriceSource } from "./prices";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400;

/** DexScreener chain → DefiLlama chain prefix and GeckoTerminal network id. */
const CHAINS: Record<string, { llama: string; gt: string }> = {
  solana: { llama: "solana", gt: "solana" },
  ethereum: { llama: "ethereum", gt: "eth" },
  base: { llama: "base", gt: "base" },
  bsc: { llama: "bsc", gt: "bsc" },
  arbitrum: { llama: "arbitrum", gt: "arbitrum" },
};

export type DexToken = { chain: string; address: string; pool: string; symbol: string; liquidityUsd: number; listedAt: number };

const dexBase = () => (process.env.DEXSCREENER_BASE ?? "https://api.dexscreener.com").replace(/\/$/, "");
const gtBase = () => (process.env.GECKOTERMINAL_BASE ?? "https://api.geckoterminal.com/api/v2").replace(/\/$/, "");

async function getJson(url: string, tries = 3): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (res?.ok) return res.json();
    if (attempt + 1 >= tries || (res && res.status !== 429 && res.status < 500)) return null;
    await sleep((res?.status === 429 ? 15_000 : 2_000) * (attempt + 1));
  }
}

const tickerKey = (t: string) => t.replace(/^\$/, "").trim().toUpperCase();
// not coins (stocks, metals, generic words), or too generic to look up by name: a DEX token
// with the same symbol would be a different thing
const SKIP = new Set(
  ("CA USD USDC USDT NFT NFTS ETF AI MEME MEMES ALTS ALT CRYPTO GOLD SILVER OIL DXY VIX " +
    "SPY QQQ IWM SLV GLD TLT COIN TWTR HUYA GME AMC SNAP AMD NVDA TSLA AAPL MSFT GOOG GOOGL AMZN META NFLX MSTR HOOD GLXY YY PLTR SQ PYPL BABA NIO RIOT MARA CRCL")
    .split(" "),
);

/**
 * ticker → the tokens trading under that symbol, most liquid first, for
 * every ticker no list knows. `firstSeen` is the earliest call on the ticker
 * (unix seconds); a token is only kept if it could be the one meant by some
 * call, and each call later picks the best token that already traded on its
 * date (dexPriceIds).
 */
export async function resolveTickers(firstSeen: Map<string, number>, opts: { delayMs?: number; log?: (s: string) => void } = {}): Promise<Map<string, DexToken[]>> {
  const out = new Map<string, DexToken[]>();
  // DexScreener allows ~300 searches a minute per IP; builds run up to 5 at a time, so stay well under
  const delay = opts.delayMs ?? Number(process.env.DEXSCREENER_DELAY_MS ?? 1000);
  let looked = 0;
  for (const [raw] of firstSeen) {
    const ticker = tickerKey(raw);
    if (ticker.length < 2 || SKIP.has(ticker) || COINGECKO_IDS[ticker] || !/^[A-Z0-9]+$/.test(ticker)) continue;
    looked++;
    const j = await getJson(`${dexBase()}/latest/dex/search?q=${encodeURIComponent(ticker)}`);
    await sleep(delay);
    const pairs: any[] = Array.isArray(j?.pairs) ? j.pairs : [];
    const byToken = new Map<string, DexToken>();
    for (const p of pairs) {
      if (!CHAINS[p?.chainId] || String(p?.baseToken?.symbol ?? "").toUpperCase() !== ticker) continue;
      const key = `${p.chainId}:${p.baseToken.address}`;
      const liq = Number(p?.liquidity?.usd ?? 0) || 0;
      const listed = Math.floor(Number(p?.pairCreatedAt ?? 0) / 1000) || Number.MAX_SAFE_INTEGER;
      const t = byToken.get(key);
      if (!t) byToken.set(key, { chain: p.chainId, address: p.baseToken.address, pool: p.pairAddress, symbol: ticker, liquidityUsd: liq, listedAt: listed });
      else {
        t.liquidityUsd += liq;
        // the token's oldest pool has the longest candle history
        if (listed < t.listedAt) [t.listedAt, t.pool] = [listed, p.pairAddress];
      }
    }
    // dust-liquidity copies of a symbol are noise
    const tokens = [...byToken.values()].filter((t) => t.liquidityUsd >= 1_000).sort((a, b) => b.liquidityUsd - a.liquidityUsd);
    if (tokens.length) out.set(ticker, tokens);
  }
  opts.log?.(`DexScreener: ${out.size} of ${looked} unknown tickers matched a token`);
  return out;
}

/** Candidate price ids for a call: the most liquid token that already traded on the call's date. */
export function dexPriceIds(tokens: DexToken[] | undefined, calledAtSec: number): string[] {
  const token = tokens?.find((t) => t.listedAt <= calledAtSec + 2 * DAY);
  if (!token) return [];
  const c = CHAINS[token.chain];
  return [`${c.llama}:${token.address}`, `gt:${c.gt}:${token.pool}`];
}

/** Daily closes from GeckoTerminal pool candles ("gt:<network>:<pool>" ids). Free API: last ~6 months only. */
export class GeckoTerminalPrices implements PriceSource {
  readonly name = "GeckoTerminal";
  private delay = Number(process.env.GECKOTERMINAL_DELAY_MS ?? 2_200); // ~30 requests a minute without a key

  async batch(req: Record<string, number[]>): Promise<Record<string, (PricePoint | null)[]>> {
    const out: Record<string, (PricePoint | null)[]> = {};
    const horizon = Math.floor(Date.now() / 1000) - 180 * DAY;
    for (const [id, tss] of Object.entries(req)) {
      out[id] = tss.map(() => null);
      if (!tss.some((t) => t >= horizon)) continue; // nothing the free API can reach
      const [, network, pool] = id.split(":");
      const j = await getJson(`${gtBase()}/networks/${network}/pools/${pool}/ohlcv/day?limit=182&currency=usd&token=base`);
      await sleep(this.delay);
      const list: number[][] = j?.data?.attributes?.ohlcv_list ?? [];
      // [day start, open, high, low, close, volume]
      const byDay = new Map(list.map((c) => [Math.floor(c[0] / DAY), c]));
      out[id] = tss.map((ts) => {
        const c = byDay.get(Math.floor(ts / DAY));
        return c && c[4] > 0 ? { timestamp: c[0] + DAY - 1, price: c[4] } : null;
      });
    }
    return out;
  }
}
