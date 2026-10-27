/**
 * Tickers no curated list knows, matched against CoinGecko's full coin list
 * (free, no key): every coin with that symbol (or, failing that, that name),
 * biggest market cap first. Each call then takes the first candidate that
 * DefiLlama priced on the call's date — a coin that didn't exist yet can't be
 * the one meant, so a 2018 "$SKY" lands on Skycoin, not on a 2024 namesake.
 * These matches are marked "symbol" so the site shows them as approximate.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = () => (process.env.COINGECKO_BASE ?? "https://api.coingecko.com/api/v3").replace(/\/$/, "");

type Coin = { id: string; symbol: string; name: string };

async function getJson(url: string, tries = 4): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (res?.ok) return res.json();
    if (attempt + 1 >= tries || (res && res.status !== 429 && res.status < 500)) return null;
    // the public API allows a handful of calls a minute
    await sleep((res?.status === 429 ? 30_000 : 3_000) * (attempt + 1));
  }
}

// bridged and wrapped copies share the symbol of the real coin and never are the call
const COPY = /(wormhole|bridged|wrapped|binance-peg|-peg-|peg-|allbridge|celer|multichain|axelar|heco|-iou|old-|-old$|-v1$)/;
const MAX_PER_TICKER = 12;

let listOnce: Promise<Coin[]> | null = null;
function coinList(): Promise<Coin[]> {
  listOnce ??= getJson(`${base()}/coins/list`).then((j) => (Array.isArray(j) ? (j as Coin[]) : []));
  return listOnce;
}

/**
 * ticker → ["coingecko:<id>", …] ranked by current market cap (unranked last).
 * `log` reports how many tickers found candidates.
 */
export async function coingeckoCandidates(tickers: string[], opts: { log?: (s: string) => void; delayMs?: number } = {}): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const want = [...new Set(tickers.map((t) => t.replace(/^\$/, "").trim().toUpperCase()).filter((t) => /^[A-Z0-9]{2,15}$/.test(t)))];
  if (!want.length) return out;
  const list = await coinList();
  if (!list.length) {
    opts.log?.("CoinGecko: coin list unavailable, skipped");
    return out;
  }
  const bySymbol = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const c of list) {
    if (!c?.id || COPY.test(c.id)) continue;
    const s = String(c.symbol ?? "").toUpperCase();
    const n = String(c.name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (s) bySymbol.set(s, [...(bySymbol.get(s) ?? []), c.id]);
    if (n) byName.set(n, [...(byName.get(n) ?? []), c.id]);
  }
  const cands = new Map<string, string[]>();
  for (const t of want) {
    const ids = bySymbol.get(t) ?? byName.get(t) ?? [];
    if (ids.length) cands.set(t, ids);
  }

  // rank every candidate by market cap, 250 ids per request
  const all = [...new Set([...cands.values()].flat())];
  const rank = new Map<string, number>();
  const delay = opts.delayMs ?? Number(process.env.COINGECKO_DELAY_MS ?? 6_500);
  for (let i = 0; i < all.length; i += 250) {
    const ids = all.slice(i, i + 250);
    const j = await getJson(`${base()}/coins/markets?vs_currency=usd&per_page=250&page=1&ids=${encodeURIComponent(ids.join(","))}`);
    for (const m of Array.isArray(j) ? j : []) if (m?.id && m.market_cap_rank) rank.set(m.id, Number(m.market_cap_rank));
    if (i + 250 < all.length) await sleep(delay);
  }
  for (const [t, ids] of cands) {
    const ranked = [...ids].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity)).slice(0, MAX_PER_TICKER);
    out.set(t, ranked.map((id) => `coingecko:${id}`));
  }
  opts.log?.(`CoinGecko: ${out.size} of ${want.length} unknown tickers have candidates (${all.length} coins)`);
  return out;
}
