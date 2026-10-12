import "server-only";

import type { User } from "./auth";
import { sql } from "./data";

/**
 * Running the site: an error log the admin page reads, a daily ceiling on
 * model spend, and who counts as an admin.
 */

/** Record an error for the admin page. Never throws. */
export async function logError(source: "server" | "client", route: string, err: unknown, ctx: { userId?: number | null; clientHash?: string | null } = {}) {
  const e = err as { message?: string; stack?: string } | null;
  const message = String(e?.message ?? err ?? "unknown").slice(0, 500);
  const detail = e?.stack ? String(e.stack).slice(0, 4000) : null;
  try {
    await sql()`insert into errors (source, route, message, detail, user_id, client_hash) values (${source}, ${route}, ${message}, ${detail}, ${ctx.userId ?? null}, ${ctx.clientHash ?? null})`;
  } catch {
    /* the log must never break a request */
  }
}

/* ───────────────────────── daily budget ───────────────────────── */

/** Ceiling on what chats and groups may spend on the model per UTC day. */
export const dailyBudgetUsd = () => Number(process.env.DAILY_BUDGET_USD ?? 50);

let cached: { at: number; usd: number } | null = null;

/** Model spend on chats and groups since 00:00 UTC (cached for 20s per instance). */
export async function spentTodayUsd(): Promise<number> {
  if (cached && Date.now() - cached.at < 20_000) return cached.usd;
  const [r] = await sql()<{ usd: string | null }[]>`
    select coalesce(sum(usd), 0) as usd from spend
    where kind = 'llm' and meta->>'step' in ('chat', 'group') and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  cached = { at: Date.now(), usd: Number(r?.usd ?? 0) };
  return cached.usd;
}

/** Called after each answer so the cached total doesn't lag behind a burst. */
export function noteSpend(usd: number) {
  if (cached) cached.usd += usd;
}

export type Busy = { error: string; reason: "busy"; resetsAt: string };

/** null when there is room left today; otherwise the reply to send. */
export async function overBudget(): Promise<Busy | null> {
  let spent = 0;
  try {
    spent = await spentTodayUsd();
  } catch {
    return null; // if the ledger can't be read, don't take the site down
  }
  if (spent < dailyBudgetUsd()) return null;
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  return {
    error: "The intelligences are resting — today's capacity is used up. They're back at 00:00 UTC.",
    reason: "busy",
    resetsAt: midnight.toISOString(),
  };
}

/* ───────────────────────── admin ───────────────────────── */

/** X handles allowed on /admin (comma-separated ADMIN_HANDLES; the owner by default). */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  const list = (process.env.ADMIN_HANDLES ?? "WTirakhmn").split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
  return list.includes(user.handle.toLowerCase());
}
