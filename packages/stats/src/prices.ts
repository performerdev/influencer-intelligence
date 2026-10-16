/**
 * Historical prices from DefiLlama's free coins API (no key).
 * Coin ids: "coingecko:<id>" or "<chain>:<address>" (e.g. "solana:<mint>").
 * Base URL is configurable (PRICE_API_BASE) so another provider can be dropped in.
 */

export type PricePoint = { timestamp: number; price: number };

export interface PriceSource {
  readonly name: string;
  /** For each coin, the price closest to each requested unix timestamp (within searchWidth), or null. */
  batch(req: Record<string, number[]>): Promise<Record<string, (PricePoint | null)[]>>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DefiLlamaPrices implements PriceSource {
  readonly name = "DefiLlama coins API";
  private base = (process.env.PRICE_API_BASE ?? "https://coins.llama.fi").replace(/\/$/, "");
  private widthSec = 12 * 3600;

  private async get(path: string): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
      if (res?.ok) return res.json();
      if (attempt >= 4 || (res && res.status < 500 && res.status !== 429)) {
        throw new Error(`price API ${res ? res.status : "network error"} for ${path.slice(0, 120)}`);
      }
      await sleep(1500 * 2 ** attempt);
    }
  }

  async batch(req: Record<string, number[]>): Promise<Record<string, (PricePoint | null)[]>> {
    const out: Record<string, (PricePoint | null)[]> = {};
    for (const [coin, tss] of Object.entries(req)) out[coin] = tss.map(() => null);
    // Keep each URL short: the API answers 414 past ~8 KB, and a coin called hundreds of times
    // (SOL, ETH) has well over a thousand timestamps. Chunks of at most PER_REQUEST timestamps.
    const PER_REQUEST = 120;
    const chunks: Record<string, number[]>[] = [];
    let cur: Record<string, number[]> = {};
    let size = 0;
    for (const [coin, tss] of Object.entries(req)) {
      for (let i = 0; i < tss.length; i += PER_REQUEST) {
        const part = tss.slice(i, i + PER_REQUEST);
        if (size + part.length > PER_REQUEST && size > 0) {
          chunks.push(cur);
          cur = {};
          size = 0;
        }
        cur[coin] = [...(cur[coin] ?? []), ...part];
        size += part.length;
      }
    }
    if (size) chunks.push(cur);

    const points = new Map<string, PricePoint[]>();
    for (const chunk of chunks) {
      let data: any = null;
      try {
        data = await this.get(`/batchHistorical?coins=${encodeURIComponent(JSON.stringify(chunk))}&searchWidth=12h`);
      } catch {
        data = null;
      }
      for (const [coin, tss] of Object.entries(chunk)) {
        const pts: PricePoint[] = (data?.coins?.[coin]?.prices ?? []).map((p: any) => ({ timestamp: Number(p.timestamp), price: Number(p.price) }));
        if (data) points.set(coin, [...(points.get(coin) ?? []), ...pts]);
        else {
          // this chunk failed: one point at a time
          const one = await Promise.all(
            tss.map(async (ts) => {
              try {
                const j = await this.get(`/prices/historical/${ts}/${encodeURIComponent(coin)}?searchWidth=12h`);
                const c = j?.coins?.[coin];
                return c ? { timestamp: Number(c.timestamp), price: Number(c.price) } : null;
              } catch {
                return null;
              }
            }),
          );
          points.set(coin, [...(points.get(coin) ?? []), ...one.filter((x): x is PricePoint => !!x)]);
        }
      }
    }
    for (const [coin, tss] of Object.entries(req)) {
      const pts = points.get(coin) ?? [];
      out[coin] = tss.map((ts) => nearest(pts, ts, this.widthSec));
    }
    return out;
  }
}

function nearest(pts: PricePoint[], ts: number, width: number): PricePoint | null {
  let best: PricePoint | null = null;
  for (const p of pts) {
    if (!Number.isFinite(p.price) || p.price <= 0) continue;
    if (Math.abs(p.timestamp - ts) > width) continue;
    if (!best || Math.abs(p.timestamp - ts) < Math.abs(best.timestamp - ts)) best = p;
  }
  return best;
}
