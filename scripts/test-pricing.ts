/**
 * Offline test for call pricing: contract addresses in post text, CoinGecko
 * symbol matching with the call-date check, stocks priced on weekends, and
 * each id routed to its source. A local HTTP server stands in for every API.
 *
 *   pnpm test:pricing
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";

const PORT = Number(process.env.PRICING_TEST_PORT ?? 4021);
const B = `http://127.0.0.1:${PORT}`;
process.env.PRICE_API_BASE = `${B}/llama`;
process.env.COINGECKO_BASE = `${B}/cg`;
process.env.YAHOO_BASE = `${B}/yahoo`;
process.env.STOOQ_BASE = `${B}/stooq`;
process.env.DEXSCREENER_BASE = `${B}/dex`;
process.env.GECKOTERMINAL_BASE = `${B}/gt`;
process.env.COINGECKO_DELAY_MS = "0";
process.env.DEXSCREENER_DELAY_MS = "0";
process.env.STOCK_DELAY_MS = "0";
process.env.GECKOTERMINAL_DELAY_MS = "0";

const DAY = 86_400;
const d = (s: string) => Math.floor(Date.parse(`${s}T12:00:00Z`) / 1000);
const MINT = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";

// price per id, as a function of unix time (undefined = no data then)
const LLAMA: Record<string, (t: number) => number | undefined> = {
  "coingecko:skycoin": (t) => (t < d("2020-01-01") ? 10 * (1 + (t - d("2018-01-01")) / (100 * DAY)) : 1),
  "coingecko:sky": (t) => (t >= d("2024-09-01") ? 0.06 : undefined), // 2024 namesake: no price in 2018
  "coingecko:dydx": (t) => 2 + (t - d("2022-01-01")) / (1000 * DAY),
  [`solana:${MINT}`]: (t) => 0.5 + (t - d("2024-03-01")) / (100 * DAY),
  // launch day: a placeholder price, then the real one
  "coingecko:apelaunch": (t) => (t < d("2022-03-18") ? 0.01 : 10),
};
// NVDA: daily closes on weekdays only
const yahoo = (from: number, to: number) => {
  const ts: number[] = [];
  const adj: number[] = [];
  for (let t = Math.floor(from / DAY) * DAY; t <= to; t += DAY) {
    const wd = new Date(t * 1000).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    ts.push(t + 14 * 3600);
    adj.push(100 + (t - d("2024-06-01")) / DAY); // +1 a day
  }
  return { chart: { result: [{ timestamp: ts, indicators: { adjclose: [{ adjclose: adj }], quote: [{ close: adj.map((x) => x * 10) }] } }] } };
};

const server = createServer((req, res) => {
  const u = new URL(req.url ?? "/", B);
  const send = (j: unknown) => (res.writeHead(200, { "content-type": "application/json" }), res.end(JSON.stringify(j)));
  if (u.pathname === "/llama/batchHistorical") {
    const coins = JSON.parse(u.searchParams.get("coins") ?? "{}") as Record<string, number[]>;
    const out: Record<string, { prices: { timestamp: number; price: number }[] }> = {};
    for (const [id, tss] of Object.entries(coins)) {
      const f = LLAMA[id];
      out[id] = { prices: f ? tss.map((t) => ({ timestamp: t, price: f(t)! })).filter((p) => p.price != null) : [] };
    }
    return send({ coins: out });
  }
  if (u.pathname === "/cg/coins/list")
    return send([
      { id: "skycoin", symbol: "sky", name: "Skycoin" },
      { id: "sky", symbol: "sky", name: "Sky" },
      { id: "sky-wormhole", symbol: "sky", name: "Sky (Wormhole)" },
      { id: "dydx", symbol: "ethdydx", name: "dYdX" },
      { id: "zcash", symbol: "zec", name: "Zcash" },
    ]);
  if (u.pathname === "/cg/coins/markets") {
    const ids = (u.searchParams.get("ids") ?? "").split(",");
    return send(ids.map((id) => ({ id, market_cap_rank: id === "sky" ? 50 : id === "skycoin" ? 1500 : null })));
  }
  if (u.pathname.startsWith("/yahoo/v8/finance/chart/")) return send(yahoo(Number(u.searchParams.get("period1")), Number(u.searchParams.get("period2"))));
  if (u.pathname.startsWith("/dex/latest/dex/tokens/")) {
    const a = u.pathname.split("/").pop();
    if (a !== MINT) return send({ pairs: [] });
    return send({ pairs: [{ chainId: "solana", pairAddress: "POOL1", pairCreatedAt: Date.parse("2024-01-01") ,baseToken: { address: MINT, symbol: "POPCAT" } }] });
  }
  if (u.pathname.startsWith("/dex/latest/dex/search")) return send({ pairs: [] });
  res.writeHead(404).end();
});

async function main() {
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
  const { addressesIn, coingeckoCandidates, computeStats, contractPriceIds, DefiLlamaPrices, isNotCoin, priceIds, resolveAddresses, StockPrices } = await import("@ii/stats");

  // addresses in text
  const text = `aped this one\n${MINT}\nalso see https://dexscreener.com/solana/ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijk and 0x6982508145454Ce325dDbE47a25d4ec3d2311933`;
  const found = addressesIn(text);
  assert.deepEqual(found.map((f) => f.kind), ["solana", "evm"], "a mint and an EVM address, not the URL's pair");
  assert.equal(found[0].address, MINT);
  assert.equal(addressesIn("thisisjustaverylongwordwithoutanydigitsatallinit").length, 0);

  // not coins
  assert.ok(isNotCoin("ALTS") && isNotCoin("$usdc") && isNotCoin("EAGLES") && isNotCoin("4"));
  assert.ok(!isNotCoin("SOL") && !isNotCoin("CA") && !isNotCoin("ONE"));

  // priceIds: stocks and earlier ids
  assert.deepEqual(priceIds({ ticker: "NVDA", chain: null, address: null }), ["stock:NVDA"]);
  assert.deepEqual(priceIds({ ticker: "GOLD", chain: null, address: null }), ["stock:GC=F"]);
  assert.deepEqual(priceIds({ ticker: "DYDX", chain: null, address: null }), ["coingecko:dydx-chain", "coingecko:dydx"]);

  // CoinGecko candidates: ranked, copies dropped, names matched too
  const cg = await coingeckoCandidates(["SKY", "ZCASH", "NOPE"]);
  assert.deepEqual(cg.get("SKY"), ["coingecko:sky", "coingecko:skycoin"]);
  assert.deepEqual(cg.get("ZCASH"), ["coingecko:zcash"]);
  assert.ok(!cg.has("NOPE"));

  const tokens = await resolveAddresses(found);
  const pop = tokens.get(MINT.toLowerCase())!;
  assert.equal(pop.symbol, "POPCAT");

  const calls = [
    { post_id: "1", ticker: "SKY", chain: null, address: null, direction: "buy" as const, called_at: new Date("2018-03-01T12:00:00Z") },
    { post_id: "2", ticker: "SKY", chain: null, address: null, direction: "buy" as const, called_at: new Date("2025-03-01T12:00:00Z") },
    { post_id: "3", ticker: "NVDA", chain: null, address: null, direction: "buy" as const, called_at: new Date("2024-06-08T12:00:00Z") }, // a Saturday
    { post_id: "4", ticker: "CA", chain: null, address: null, direction: "buy" as const, called_at: new Date("2024-03-01T12:00:00Z") },
    { post_id: "5", ticker: "DYDX", chain: null, address: null, direction: "sell" as const, called_at: new Date("2022-06-01T12:00:00Z") },
    { post_id: "6", ticker: "APEX", chain: null, address: null, direction: "sell" as const, called_at: new Date("2022-03-17T12:00:00Z") },
  ];
  const stats = await computeStats(calls, new DefiLlamaPrices(), new Date("2026-10-28T00:00:00Z"), {
    extraIds: (c) => (c.post_id === "4" ? contractPriceIds(pop) : c.post_id === "6" ? ["coingecko:apelaunch"] : (cg.get(c.ticker) ?? [])),
    sources: [{ prefix: "stock:", source: new StockPrices() }],
    matchedBy: (c, id) => (id.startsWith("stock:") ? "stock" : priceIds(c).includes(id) || c.post_id === "4" ? null : "symbol"),
    symbolOf: (c) => (c.post_id === "4" ? pop.symbol : null),
  });
  const by = new Map(stats.per_call.map((p) => [p.post_id, p]));
  assert.equal(by.get("1")!.price_id, "coingecko:skycoin", "2018 SKY: the 2024 namesake had no price yet");
  assert.equal(by.get("1")!.matched_by, "symbol");
  assert.equal(by.get("2")!.price_id, "coingecko:sky", "2025 SKY: the bigger coin");
  const nv = by.get("3")!;
  assert.equal(nv.price_id, "stock:NVDA");
  assert.equal(nv.matched_by, "stock");
  // Saturday 2024-06-08 → Friday 06-07 close; +7d Saturday 06-15 → Friday 06-14 close (the mock adds 1 a day)
  const close = (day: string) => 100 + (Date.parse(`${day}T00:00:00Z`) / 1000 - d("2024-06-01")) / DAY;
  assert.equal(nv.price_at_call, close("2024-06-07"));
  assert.equal(nv.r_7d, Math.round((close("2024-06-14") / close("2024-06-07") - 1) * 1e4) / 1e4);
  assert.equal(by.get("4")!.price_id, `solana:${MINT}`);
  assert.equal(by.get("4")!.symbol, "POPCAT");
  assert.equal(by.get("4")!.matched_by, null);
  assert.equal(by.get("5")!.price_id, "coingecko:dydx", "falls back to the earlier dYdX id");
  assert.ok(by.get("5")!.r_7d! < 0, "a sell before a rise is negative");
  assert.equal(by.get("6")!.price_at_call, null, "a 1000x jump the day after launch is bad data, not a −99,900% sell");
  assert.equal(stats.calls_priced, 5);
  console.log("pricing test passed:", stats.per_call.map((p) => `${p.ticker}${p.symbol ? `→${p.symbol}` : ""}=${p.price_id}(${p.matched_by ?? "exact"})`).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => server.close());
