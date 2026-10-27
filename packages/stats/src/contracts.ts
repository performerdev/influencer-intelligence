/**
 * Contract addresses written in the post itself. The call extraction keeps
 * the ticker ("CA" when the post only has an address) but sometimes drops the
 * address; the post text still has it. DexScreener (free, no key) turns the
 * address into the token: its symbol, chain and oldest pool, so DefiLlama can
 * price it by address and GeckoTerminal can fill in from the pool's candles.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dexBase = () => (process.env.DEXSCREENER_BASE ?? "https://api.dexscreener.com").replace(/\/$/, "");

/** DexScreener chain → DefiLlama chain prefix and GeckoTerminal network id (same table as dex.ts). */
const CHAINS: Record<string, { llama: string; gt: string }> = {
  solana: { llama: "solana", gt: "solana" },
  ethereum: { llama: "ethereum", gt: "eth" },
  base: { llama: "base", gt: "base" },
  bsc: { llama: "bsc", gt: "bsc" },
  arbitrum: { llama: "arbitrum", gt: "arbitrum" },
};

export type Found = { kind: "solana" | "evm"; address: string };
export type ContractToken = { chain: string; address: string; symbol: string; pool: string; listedAt: number };

// base58 without 0 O I l; long enough that no word or t.co slug matches
const SOL = /(?<![A-Za-z0-9/])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g;
const EVM = /(?<![A-Za-z0-9])0x[a-fA-F0-9]{40}(?![A-Za-z0-9])/g;

/** Addresses in a post, in order. Solana candidates must mix letters and digits (real mints do). */
export function addressesIn(text: string): Found[] {
  const out: Found[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(EVM)) if (!seen.has(m[0].toLowerCase())) (seen.add(m[0].toLowerCase()), out.push({ kind: "evm", address: m[0] }));
  for (const m of text.matchAll(SOL)) {
    const a = m[0];
    if (!/[0-9]/.test(a) || !/[a-z]/.test(a) || !/[A-Z]/.test(a) || seen.has(a)) continue;
    seen.add(a);
    out.push({ kind: "solana", address: a });
  }
  return out.sort((a, b) => text.indexOf(a.address) - text.indexOf(b.address));
}

async function getJson(url: string, tries = 3): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (res?.ok) return res.json();
    if (attempt + 1 >= tries || (res && res.status !== 429 && res.status < 500)) return null;
    await sleep((res?.status === 429 ? 15_000 : 2_000) * (attempt + 1));
  }
}

/** address → the token DexScreener knows for it (any supported chain), oldest pool kept for candles. */
export async function resolveAddresses(found: Found[], opts: { delayMs?: number; log?: (s: string) => void } = {}): Promise<Map<string, ContractToken>> {
  const out = new Map<string, ContractToken>();
  const delay = opts.delayMs ?? Number(process.env.DEXSCREENER_DELAY_MS ?? 1000);
  const uniq = [...new Map(found.map((f) => [f.address.toLowerCase(), f])).values()];
  for (const f of uniq) {
    const j = await getJson(`${dexBase()}/latest/dex/tokens/${f.address}`);
    await sleep(delay);
    const pairs: any[] = (Array.isArray(j?.pairs) ? j.pairs : []).filter(
      (p: any) => CHAINS[p?.chainId] && String(p?.baseToken?.address ?? "").toLowerCase() === f.address.toLowerCase(),
    );
    if (!pairs.length) continue;
    // the token's oldest pool has the longest candle history
    pairs.sort((a, b) => Number(a?.pairCreatedAt ?? Infinity) - Number(b?.pairCreatedAt ?? Infinity));
    const p = pairs[0];
    out.set(f.address.toLowerCase(), {
      chain: p.chainId,
      address: p.baseToken.address,
      symbol: String(p.baseToken.symbol ?? "").toUpperCase(),
      pool: p.pairAddress,
      listedAt: Math.floor(Number(p.pairCreatedAt ?? 0) / 1000) || 0,
    });
  }
  opts.log?.(`Contracts in posts: ${out.size} of ${uniq.length} addresses found on DexScreener`);
  return out;
}

/** Price ids for a token found by address: exact, so no "matched by ticker" mark. */
export function contractPriceIds(t: ContractToken): string[] {
  const c = CHAINS[t.chain];
  return c ? [`${c.llama}:${t.address}`, `gt:${c.gt}:${t.pool}`] : [];
}
