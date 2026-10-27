import "server-only";

import type { Intelligence } from "@/lib/intelligences";
import { type RecordRow, recordRows } from "@/lib/record";

import { hasDatabase, loadIntelligences, sql } from "./data";

/** Every mind's calls in one list (row.m = the mind's index in `minds`). */
export type CTRecord = { minds: Intelligence[]; rows: (RecordRow & { m: number })[]; computedAt: string | null };

const TTL_MS = 10 * 60_000;
let memo: { at: number; rec: Promise<CTRecord> } | null = null;

/**
 * Calls and their prices for every mind, from the latest brain of each. Only
 * the two record files are read (not the prompt or the mind), and the result
 * is kept per instance for ten minutes — the record changes once a week.
 */
export function loadRecord(): Promise<CTRecord> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.rec;
  const rec = build().catch((err) => {
    memo = null;
    throw err;
  });
  memo = { at: Date.now(), rec };
  return rec;
}

async function build(): Promise<CTRecord> {
  const minds = (await loadIntelligences()).filter((i) => i.distilledAt);
  if (!hasDatabase() || !minds.length) return { minds, rows: [], computedAt: null };
  const files = await sql()<{ code: string; calls: unknown; per_call: unknown; computed_at: string | null }[]>`
    select i.code, b.files -> 'calls' as calls, b.files -> 'stats' -> 'per_call' as per_call, b.files -> 'stats' ->> 'computed_at' as computed_at
    from influencers i
    join lateral (select files from brains where influencer_id = i.id order by version desc limit 1) b on true
    where not coalesce(i.hidden, false)`;
  const byCode = new Map(files.map((f) => [f.code, f]));
  const rows: CTRecord["rows"] = [];
  let computedAt: string | null = null;
  minds.forEach((it, m) => {
    const f = byCode.get(it.code);
    if (!f) return;
    for (const r of recordRows(f.calls as never, f.per_call as never)) rows.push({ ...r, m });
    if (f.computed_at && (!computedAt || f.computed_at > computedAt)) computedAt = f.computed_at;
  });
  rows.sort((a, b) => a.t - b.t);
  return { minds, rows, computedAt };
}

/* ───────────────────────── live price and history ───────────────────────── */

const LLAMA = () => (process.env.PRICE_API_BASE ?? "https://coins.llama.fi").replace(/\/$/, "");

async function getJson(url: string, ms = 4000): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" }, next: { revalidate: 900 } } as RequestInit);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Price now and its 24h change, for a DefiLlama id. Null when the source has nothing. */
export async function livePrice(pid: string): Promise<{ price: number; change24h: number | null } | null> {
  if (pid.startsWith("stock:")) return null;
  try {
    const [p, c] = await Promise.all([getJson(`${LLAMA()}/prices/current/${encodeURIComponent(pid)}`), getJson(`${LLAMA()}/percentage/${encodeURIComponent(pid)}?period=24h`).catch(() => null)]);
    const price = Number(p?.coins?.[pid]?.price);
    if (!(price > 0)) return null;
    const ch = c?.coins?.[pid];
    return { price, change24h: ch == null ? null : Number(ch) };
  } catch {
    return null;
  }
}

/** Closes from `fromMs` to now, at most ~500 points (daily for two years or less, then coarser). */
export async function priceHistory(pid: string, fromMs: number): Promise<[number, number][]> {
  if (pid.startsWith("stock:")) return [];
  const start = Math.floor(fromMs / 1000);
  const days = Math.max(1, Math.ceil((Date.now() / 1000 - start) / 86_400));
  const step = Math.max(1, Math.ceil(days / 480));
  const out: [number, number][] = [];
  try {
    const j = await getJson(`${LLAMA()}/chart/${encodeURIComponent(pid)}?start=${start}&span=${Math.ceil(days / step) + 1}&period=${step}d&searchWidth=${Math.max(1, step)}d`, 6000);
    for (const p of j?.coins?.[pid]?.prices ?? []) if (Number(p.price) > 0) out.push([Number(p.timestamp) * 1000, Number(p.price)]);
  } catch {
    /* the chart draws without a price line */
  }
  return out.sort((a, b) => a[0] - b[0]);
}
