import "server-only";

import type { Call } from "@ii/brain-core";
import { recordSpend } from "@ii/db";
import { COINGECKO_IDS } from "@ii/stats";

import type { LoadedBrain } from "./data";
import { sql } from "./data";

/**
 * What a brain can't know from its posts: prices right now, and what the
 * person posted since the brain was built. Both are attached to the single
 * chat turn (not the cached brain prompt), clearly labelled as live data.
 * Every lookup has a short timeout; a failure just leaves the block out.
 */

/* ───────────────────────── live prices ───────────────────────── */

const NAMES: Record<string, string> = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  ETHER: "ETH",
  SOLANA: "SOL",
  DOGECOIN: "DOGE",
  RIPPLE: "XRP",
  CARDANO: "ADA",
  HYPERLIQUID: "HYPE",
  CHAINLINK: "LINK",
  SUI: "SUI",
};

type Quote = { symbol: string; price: number; change24h: number | null; mcap: number | null; liquidity: number | null; chain: string | null; source: string };

const LLAMA = () => (process.env.PRICE_API_BASE ?? "https://coins.llama.fi").replace(/\/$/, "");
const DEX = () => (process.env.DEXSCREENER_BASE ?? "https://api.dexscreener.com").replace(/\/$/, "");

const quoteCache = new Map<string, { at: number; q: Quote | null }>();

async function getJson(url: string, ms = 2500): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 80)}`);
  return res.json();
}

/** Tickers worth a live price: $CASHTAGS, majors by name or symbol, and coins this brain has called. */
export function priceTickers(text: string, calls: Call[], max = 4): string[] {
  const found: string[] = [];
  const add = (t: string) => {
    if (t && !found.includes(t)) found.push(t);
  };
  for (const m of text.matchAll(/\$([A-Za-z][A-Za-z0-9]{1,14})\b/g)) add(m[1].toUpperCase());
  const called = new Set(calls.map((c) => c.ticker.toUpperCase()));
  for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9]{1,14})\b/g)) {
    const raw = m[1];
    const w = raw.toUpperCase();
    if (NAMES[w]) add(NAMES[w]);
    // bare symbols only when written in capitals ("SOL", not "sol" the word)
    else if (raw === w && w.length >= 2 && (COINGECKO_IDS[w] || called.has(w))) add(w);
  }
  return found.slice(0, max);
}

async function quoteFor(ticker: string, calls: Call[]): Promise<Quote | null> {
  const hit = quoteCache.get(ticker);
  if (hit && Date.now() - hit.at < 60_000) return hit.q;
  let q: Quote | null = null;
  try {
    const cg = COINGECKO_IDS[ticker];
    if (cg) {
      const id = `coingecko:${cg}`;
      const [p, pct] = await Promise.all([getJson(`${LLAMA()}/prices/current/${id}`), getJson(`${LLAMA()}/percentage/${id}?period=24h`).catch(() => null)]);
      const c = p?.coins?.[id];
      if (c?.price) q = { symbol: ticker, price: Number(c.price), change24h: pct?.coins?.[id] != null ? Number(pct.coins[id]) : null, mcap: null, liquidity: null, chain: null, source: "DefiLlama" };
    }
    if (!q) {
      // the brain's own calls may carry the exact contract; otherwise the deepest pool with that symbol
      const address = [...calls].reverse().find((c) => c.ticker.toUpperCase() === ticker && c.address)?.address;
      const j = address ? await getJson(`${DEX()}/latest/dex/tokens/${address}`) : await getJson(`${DEX()}/latest/dex/search?q=${encodeURIComponent(ticker)}`);
      const pairs: any[] = (j?.pairs ?? []).filter((p: any) => (address ? true : String(p?.baseToken?.symbol ?? "").toUpperCase() === ticker) && Number(p?.priceUsd) > 0);
      pairs.sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0));
      const best = pairs[0];
      // a symbol shared by many scam pools: only trust a pool with real liquidity
      if (best && (address || Number(best?.liquidity?.usd ?? 0) >= 50_000)) {
        q = {
          symbol: ticker,
          price: Number(best.priceUsd),
          change24h: best?.priceChange?.h24 != null ? Number(best.priceChange.h24) : null,
          mcap: Number(best.marketCap ?? best.fdv ?? 0) || null,
          liquidity: Number(best?.liquidity?.usd ?? 0) || null,
          chain: best.chainId ?? null,
          source: "DexScreener",
        };
      }
    }
  } catch {
    q = null;
  }
  quoteCache.set(ticker, { at: Date.now(), q });
  if (quoteCache.size > 500) quoteCache.delete(quoteCache.keys().next().value!);
  return q;
}

const money = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`;
const price = (n: number) => (n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`);

export async function marketBlock(text: string, calls: Call[]): Promise<string> {
  const tickers = priceTickers(text, calls);
  if (!tickers.length) return "";
  const quotes = (await Promise.all(tickers.map((t) => quoteFor(t, calls)))).filter((q): q is Quote => !!q);
  if (!quotes.length) return "";
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines = quotes.map(
    (q) =>
      `$${q.symbol} ${price(q.price)}${q.change24h != null ? ` (${q.change24h >= 0 ? "+" : ""}${q.change24h.toFixed(1)}% 24h)` : ""}${q.mcap ? ` · mcap ${money(q.mcap)}` : ""}${q.liquidity ? ` · liquidity ${money(q.liquidity)}` : ""}${q.chain ? ` · ${q.chain}` : ""}`,
  );
  return `=== LIVE MARKET (fetched ${now} UTC from ${[...new Set(quotes.map((q) => q.source))].join(" / ")} — current data, not from your posts) ===\n${lines.join("\n")}\nUse these numbers if price matters to the answer; your opinion still comes from your own record.`;
}

/* ───────────────────────── recent posts ───────────────────────── */

type Recent = { id: string; at: string; text: string; kind: string };
const RECENT_TTL_MS = 2 * 3600_000;
const memo = new Map<number, { at: number; posts: Recent[] }>();

/** The person's latest own posts after the brain's newest post (cached 2h, shared through the database). */
async function recentPosts(brain: LoadedBrain): Promise<Recent[]> {
  const key = process.env.TWITTERAPI_IO_KEY;
  if (!key) return [];
  const m = memo.get(brain.influencerId);
  if (m && Date.now() - m.at < RECENT_TTL_MS) return m.posts;
  const db = sql();
  const [row] = await db<{ fetched_at: Date; posts: Recent[] }[]>`select fetched_at, posts from recent_posts where influencer_id = ${brain.influencerId}`.catch(() => []);
  if (row && Date.now() - new Date(row.fetched_at).getTime() < RECENT_TTL_MS) {
    memo.set(brain.influencerId, { at: new Date(row.fetched_at).getTime(), posts: row.posts });
    return row.posts;
  }
  const base = (process.env.TWITTERAPI_IO_BASE_URL ?? "https://api.twitterapi.io").replace(/\/$/, "");
  let posts: Recent[] = row?.posts ?? [];
  try {
    const res = await fetch(`${base}/twitter/user/last_tweets?userName=${encodeURIComponent(brain.handle)}&includeReplies=false`, {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(3500),
    });
    const j = await res.json();
    const tweets: any[] = j?.data?.tweets ?? j?.tweets ?? [];
    const after = brain.postsTo ? new Date(brain.postsTo).getTime() : 0;
    posts = tweets
      .filter((t) => !t?.retweeted_tweet && !/^RT @\w+:/.test(String(t?.text ?? "")))
      .filter((t) => !Number.isNaN(new Date(t?.createdAt).getTime()))
      .map((t) => {
        const q = t.quoted_tweet;
        const quoted = q?.text ? ` [quoting @${q.author?.userName ?? "?"}: ${Array.from(String(q.text)).slice(0, 140).join("")}]` : "";
        return { id: String(t.id), at: new Date(t.createdAt).toISOString(), text: `${String(t.text ?? "")}${quoted}`, kind: q ? "quote" : t.isReply ? "thread" : "post" };
      })
      .filter((t) => new Date(t.at).getTime() > after && t.text.trim())
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12);
    await recordSpend(db, { influencerId: brain.influencerId, kind: "twitterapi", units: tweets.length, usd: Math.max(tweets.length * 0.00015, 0.00015), meta: { step: "recent" } }).catch(() => {});
    await db`
      insert into recent_posts (influencer_id, fetched_at, posts) values (${brain.influencerId}, now(), ${db.json(posts as never)})
      on conflict (influencer_id) do update set fetched_at = excluded.fetched_at, posts = excluded.posts`.catch(() => {});
  } catch {
    /* keep whatever was cached */
  }
  memo.set(brain.influencerId, { at: Date.now(), posts });
  return posts;
}

export async function recentBlock(brain: LoadedBrain): Promise<string> {
  const posts = await recentPosts(brain).catch(() => [] as Recent[]);
  if (!posts.length) return "";
  const clip = (s: string) => (Array.from(s).length > 320 ? `${Array.from(s).slice(0, 320).join("")}…` : s);
  const lines = posts.map((p) => `[${p.at.slice(0, 10)}${p.kind !== "post" ? ` · ${p.kind}` : ""}] ${clip(p.text.replace(/\s+/g, " "))}`);
  return `=== YOUR LATEST POSTS (after this brain was built, newest first — you wrote these) ===\n${lines.join("\n")}\nIf the question touches something here, your latest view wins over older ones.`;
}

/** Both live blocks for one turn, fetched in parallel. */
export async function liveContext(brain: LoadedBrain, text: string): Promise<string> {
  const [market, recent] = await Promise.all([marketBlock(text, brain.files.calls).catch(() => ""), recentBlock(brain).catch(() => "")]);
  return [recent, market].filter(Boolean).join("\n\n");
}
