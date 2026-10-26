/**
 * A mind's call record, worked out on the client from its brain files: every
 * priced call with its 7- and 30-day move (signed in the call's favor), plus
 * the rules it wrote down. Pure functions; nothing here asks a model.
 */
import { stripCitations } from "@/lib/refs";

import type { BrainFilesLite } from "./chat-brain";

export type Dir = "buy" | "sell" | "hold";
export type CallRow = { at: number; ticker: string; dir: Dir; r7: number | null; r30: number | null; postId: string; byTicker: boolean; quote: string | null };

export function callRows(f: BrainFilesLite): CallRow[] {
  const quotes = new Map(f.calls.map((c) => [c.post_id, c.quote]));
  return (f.stats?.per_call ?? [])
    .filter((p) => p.r_7d != null || p.r_30d != null)
    .map((p) => ({
      at: new Date(p.called_at).getTime(),
      ticker: p.ticker.toUpperCase(),
      dir: p.direction,
      r7: p.r_7d,
      r30: p.r_30d,
      postId: p.post_id,
      byTicker: p.matched_by === "ticker",
      quote: quotes.get(p.post_id) ?? null,
    }))
    .sort((a, b) => a.at - b.at);
}

const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type Record_ = { n: number; worked: number | null; med: number | null; last: CallRow | null };
export function record(rows: CallRow[], h: 7 | 30 = 7): Record_ {
  const rs = rows.map((c) => (h === 7 ? c.r7 : c.r30)).filter((x): x is number => x != null);
  return { n: rows.length, worked: rs.length ? rs.filter((x) => x > 0).length / rs.length : null, med: median(rs), last: rows[rows.length - 1] ?? null };
}
export const callsOn = (rows: CallRow[], ticker: string) => rows.filter((c) => c.ticker === ticker.toUpperCase());
export function topCoins(rows: CallRow[], k = 8, h: 7 | 30 = 7) {
  const m = new Map<string, CallRow[]>();
  for (const c of rows) m.set(c.ticker, [...(m.get(c.ticker) ?? []), c]);
  return [...m.entries()].map(([t, cs]) => ({ t, ...record(cs, h) })).sort((a, b) => b.n - a.n).slice(0, k);
}

export type Verdict = { label: "Backs it" | "Against" | "Mixed" | "No view"; tone: "buy" | "sell" | "hold" | "none" };
export function verdictOf(r: Record_): Verdict {
  if (!r.n) return { label: "No view", tone: "none" };
  if (r.last?.dir === "sell") return { label: "Against", tone: "sell" };
  if (r.worked != null && r.worked >= 0.5) return { label: "Backs it", tone: "buy" };
  return { label: "Mixed", tone: "hold" };
}

/** The first few plain statements of a rules.md section ("entry", "exit", "sizing", "risk", "hold", "averaging"), quotes and post ids dropped. */
export function rulesOf(md: string, section: string, n = 2): string[] {
  const parts = md.split(/\n(?=##\s)/);
  const part = parts.find((p) => p.replace(/^##\s*/, "").toLowerCase().startsWith(section));
  if (!part) return [];
  return part
    .split("\n")
    .map((l) => l.match(/^\s*[-*]\s+(.+)/)?.[1])
    .filter((l): l is string => !!l)
    .map((l) => stripCitations(l.split(/:\s*[“"]|\s[“"]/)[0]).replace(/[\s:;,—-]+$/, "").trim())
    .filter((l) => l.length > 8 && !/^no stated rule/i.test(l) && !/nigg|fag|retard/i.test(l))
    .slice(0, n);
}

export const pct = (x: number | null, d = 0) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
export const signed = (r: number | null) => {
  if (r == null) return "—";
  const a = Math.abs(r * 100);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${a >= 100 ? a.toFixed(0) : a.toFixed(1)}%`;
};
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
