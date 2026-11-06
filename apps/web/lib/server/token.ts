import "server-only";

import type { Call } from "@ii/brain-core";
import { COINGECKO_IDS } from "@ii/stats";

import { priceHistory } from "./record";

/**
 * A coin as the tools see it right now: found by ticker, contract address or
 * a DexScreener / pump.fun / Birdeye / GMGN / Solscan link, with live market
 * data, where it stands against its own history, and (on Solana) RugCheck's
 * risk report. Free sources only, each with a short timeout; whatever fails
 * is left out, never guessed.
 */

export type TokenInfo = {
  symbol: string;
  name: string | null;
  chain: string | null;
  address: string | null;
  price: number;
  change24h: number | null;
  mcap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  /** when its first pool opened (DEX tokens) */
  listedAt: string | null;
  image: string | null;
  links: { label: string; url: string }[];
  /** the price history's top and how far below it the price is now */
  top: { price: number; at: string } | null;
  change1y: number | null;
  safety: { score: number | null; risks: { name: string; level: string }[] } | null;
  source: string;
};

const LLAMA = () => (process.env.PRICE_API_BASE ?? "https://coins.llama.fi").replace(/\/$/, "");
const DEX = () => (process.env.DEXSCREENER_BASE ?? "https://api.dexscreener.com").replace(/\/$/, "");
const RUGCHECK = () => (process.env.RUGCHECK_BASE ?? "https://api.rugcheck.xyz").replace(/\/$/, "");
const LLAMA_CHAIN: Record<string, string> = { solana: "solana", ethereum: "ethereum", base: "base", bsc: "bsc", arbitrum: "arbitrum" };

async function getJson(url: string, ms = 3500): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const SOL_ADDR = /(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/;
const EVM_ADDR = /(?<![A-Za-z0-9])0x[a-fA-F0-9]{40}(?![A-Za-z0-9])/;

/** What the visitor typed: a contract address (also inside any link) or a ticker. */
export function parseCoinQuery(raw: string): { address: string } | { ticker: string } | null {
  const s = raw.trim();
  const evm = s.match(EVM_ADDR)?.[0];
  if (evm) return { address: evm };
  const sol = s.match(SOL_ADDR)?.[0];
  if (sol && /[0-9]/.test(sol) && /[a-z]/.test(sol) && /[A-Z]/.test(sol)) return { address: sol };
  const t = s.replace(/^\$/, "").toUpperCase();
  return /^[A-Z0-9]{1,15}$/.test(t) ? { ticker: t } : null;
}

const cache = new Map<string, { at: number; info: TokenInfo | null }>();

export async function lookupToken(raw: string, calls: Call[] = []): Promise<TokenInfo | null> {
  const q = parseCoinQuery(raw);
  if (!q) return null;
  const key = "address" in q ? q.address.toLowerCase() : q.ticker;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.info;
  let info: TokenInfo | null = null;
  try {
    let found: Found = null;
    if ("ticker" in q && COINGECKO_IDS[q.ticker]) found = await major(q.ticker);
    if (!found) {
      // a ticker the mind called with a contract address means that very token
      const address = "address" in q ? q.address : ([...calls].reverse().find((c) => c.ticker.replace(/^\$/, "").toUpperCase() === q.ticker && c.address)?.address ?? null);
      found = await dexToken(address, "ticker" in q ? q.ticker : null);
    }
    if (found) {
      info = found.info;
      await enrich(info, found.pid);
    }
  } catch {
    info = null;
  }
  cache.set(key, { at: Date.now(), info });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return info;
}

/** The coin, and its DefiLlama price id for history when there is one. */
type Found = { info: TokenInfo; pid: string | null } | null;

/** A large cap known by its CoinGecko id: priced by DefiLlama. */
async function major(ticker: string): Promise<Found> {
  const id = `coingecko:${COINGECKO_IDS[ticker]}`;
  const [p, pct] = await Promise.all([getJson(`${LLAMA()}/prices/current/${id}`), getJson(`${LLAMA()}/percentage/${id}?period=24h`).catch(() => null)]);
  const price = Number(p?.coins?.[id]?.price);
  if (!(price > 0)) return null;
  const info: TokenInfo = {
    symbol: ticker,
    name: null,
    chain: null,
    address: null,
    price,
    change24h: pct?.coins?.[id] != null ? Number(pct.coins[id]) : null,
    mcap: null,
    liquidity: null,
    volume24h: null,
    listedAt: null,
    image: null,
    links: [],
    top: null,
    change1y: null,
    safety: null,
    source: "DefiLlama",
  };
  return { info, pid: id };
}

/** A token on a DEX: by address (exact), or by ticker (the deepest pool with real liquidity). */
async function dexToken(address: string | null, ticker: string | null): Promise<Found> {
  let pairs: any[] = [];
  if (address) {
    const j = await getJson(`${DEX()}/latest/dex/tokens/${address}`).catch(() => null);
    pairs = (j?.pairs ?? []).filter((p: any) => String(p?.baseToken?.address ?? "").toLowerCase() === address.toLowerCase());
    if (!pairs.length) {
      // a pair address (DexScreener links point at pairs)
      const s = await getJson(`${DEX()}/latest/dex/search?q=${address}`).catch(() => null);
      const pair = (s?.pairs ?? []).find((p: any) => String(p?.pairAddress ?? "").toLowerCase() === address.toLowerCase());
      if (pair) return dexToken(pair.baseToken.address, null);
    }
  } else if (ticker) {
    const j = await getJson(`${DEX()}/latest/dex/search?q=${encodeURIComponent(ticker)}`).catch(() => null);
    const same = (j?.pairs ?? []).filter((p: any) => String(p?.baseToken?.symbol ?? "").toUpperCase() === ticker && Number(p?.priceUsd) > 0);
    same.sort((a: any, b: any) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0));
    // a symbol many copycats share: only a pool with real liquidity says which coin is meant
    const best = same[0];
    if (!best || Number(best?.liquidity?.usd ?? 0) < 50_000) return null;
    pairs = same.filter((p: any) => p.baseToken.address === best.baseToken.address && p.chainId === best.chainId);
  }
  pairs = pairs.filter((p: any) => Number(p?.priceUsd) > 0);
  if (!pairs.length) return null;
  pairs.sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0));
  const p = pairs[0];
  const info = p.info ?? pairs.find((x) => x.info)?.info ?? {};
  const links: TokenInfo["links"] = [
    ...(info.websites ?? []).slice(0, 1).map((w: any) => ({ label: "site", url: String(w.url) })),
    ...(info.socials ?? []).slice(0, 3).map((s: any) => ({ label: s.type === "twitter" ? "X" : String(s.type ?? "link"), url: String(s.url) })),
  ].filter((l) => /^https?:\/\//.test(l.url));
  const created = Math.min(...pairs.map((x) => Number(x.pairCreatedAt ?? Infinity)));
  const chain = String(p.chainId);
  const token: TokenInfo = {
    symbol: String(p.baseToken.symbol ?? "").toUpperCase(),
    name: p.baseToken.name ?? null,
    chain,
    address: String(p.baseToken.address),
    price: Number(p.priceUsd),
    change24h: p?.priceChange?.h24 != null ? Number(p.priceChange.h24) : null,
    mcap: Number(p.marketCap ?? p.fdv ?? 0) || null,
    liquidity: Math.round(pairs.reduce((s, x) => s + Number(x?.liquidity?.usd ?? 0), 0)) || null,
    volume24h: Math.round(pairs.reduce((s, x) => s + Number(x?.volume?.h24 ?? 0), 0)) || null,
    listedAt: Number.isFinite(created) ? new Date(created).toISOString() : null,
    image: typeof info.imageUrl === "string" ? info.imageUrl : null,
    links,
    top: null,
    change1y: null,
    safety: null,
    source: "DexScreener",
  };
  return { info: token, pid: LLAMA_CHAIN[chain] ? `${LLAMA_CHAIN[chain]}:${p.baseToken.address}` : null };
}

/** History (top, one year) and, on Solana, RugCheck's risk report. */
async function enrich(info: TokenInfo, pid: string | null) {
  const from = info.listedAt ? Date.parse(info.listedAt) : Date.now() - 5 * 365 * 864e5;
  const [hist, rug] = await Promise.all([
    pid ? priceHistory(pid, from).catch(() => []) : Promise.resolve([] as [number, number][]),
    info.chain === "solana" && info.address ? getJson(`${RUGCHECK()}/v1/tokens/${info.address}/report/summary`, 3000).catch(() => null) : Promise.resolve(null),
  ]);
  if (hist.length > 1) {
    const top = hist.reduce((m, h) => (h[1] > m[1] ? h : m), hist[0]);
    // the current price can be above every daily close
    if (top[1] > info.price) info.top = { price: top[1], at: new Date(top[0]).toISOString().slice(0, 10) };
    const yearAgo = Date.now() - 365 * 864e5;
    const then = hist.find((h) => h[0] >= yearAgo - 3 * 864e5);
    if (then && hist[0][0] <= yearAgo + 3 * 864e5) info.change1y = info.price / then[1] - 1;
  }
  if (rug && Array.isArray(rug.risks)) {
    info.safety = {
      score: rug.score_normalised != null ? Number(rug.score_normalised) : rug.score != null ? Number(rug.score) : null,
      risks: rug.risks.slice(0, 6).map((r: any) => ({ name: String(r.name ?? ""), level: String(r.level ?? "") })).filter((r: { name: string }) => r.name),
    };
  }
}

const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
export const priceText = (n: number) => (n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(Math.min(12, 2 - Math.floor(Math.log10(n))))}`);
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;

/** The coin as a few plain lines for the model. */
export function tokenLines(t: TokenInfo): string {
  const out = [
    `$${t.symbol}${t.name ? ` · ${t.name}` : ""}${t.chain ? ` · ${t.chain}` : ""}${t.address ? ` · contract ${t.address}` : ""}`,
    [
      `price ${priceText(t.price)}${t.change24h != null ? ` (${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(1)}% 24h)` : ""}`,
      t.mcap ? `market cap ${usd(t.mcap)}` : "",
      t.liquidity ? `DEX liquidity ${usd(t.liquidity)}` : "",
      t.volume24h ? `24h DEX volume ${usd(t.volume24h)}` : "",
      t.listedAt ? `trading since ${t.listedAt.slice(0, 10)}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  ];
  const hist = [t.top ? `${pct(t.price / t.top.price - 1)} from its top (${priceText(t.top.price)} on ${t.top.at})` : "", t.change1y != null ? `${pct(t.change1y)} over one year` : ""].filter(Boolean);
  if (hist.length) out.push(hist.join(" · "));
  if (t.safety) out.push(`RugCheck: ${t.safety.risks.length ? t.safety.risks.map((r) => `${r.name} (${r.level})`).join("; ") : "no risks flagged"}`);
  if (t.links.length) out.push(`links: ${t.links.map((l) => l.label).join(", ")}`);
  return out.join("\n");
}
