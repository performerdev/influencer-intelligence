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
    const entries = Object.entries(req);
    // keep URLs short: a handful of coins per request
    for (let i = 0; i < entries.length; i += 8) {
      const chunk = Object.fromEntries(entries.slice(i, i + 8));
      let data: any = null;
      try {
        data = await this.get(`/batchHistorical?coins=${encodeURIComponent(JSON.stringify(chunk))}&searchWidth=12h`);
      } catch {
        data = null;
      }
      for (const [coin, tss] of Object.entries(chunk)) {
        const pts: PricePoint[] = (data?.coins?.[coin]?.prices ?? []).map((p: any) => ({ timestamp: Number(p.timestamp), price: Number(p.price) }));
        out[coin] = await Promise.all(
          tss.map(async (ts) => {
            const hit = nearest(pts, ts, this.widthSec);
            if (hit || data) return hit;
            // batch endpoint failed: fall back to one point at a time
            try {
              const j = await this.get(`/prices/historical/${ts}/${encodeURIComponent(coin)}?searchWidth=12h`);
              const c = j?.coins?.[coin];
              return c ? { timestamp: Number(c.timestamp), price: Number(c.price) } : null;
            } catch {
              return null;
            }
          }),
        );
      }
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
