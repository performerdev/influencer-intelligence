import "server-only";

import { sql } from "./data";
import { dispatchJobs } from "./jobs";
import { settle } from "./plus";

let lastSweep = 0;
let lastDispatch = 0;

/**
 * Payments nobody stayed on the page for, and paid builds whose wake-up got lost.
 * GitHub runs the worker's 10-minute schedule only every few hours in practice,
 * so the site does this itself too: from the worker's tick, and after ordinary
 * requests (at most every few minutes per server instance, after the response).
 */
export async function sweep({ budgetMs, minGapMs }: { budgetMs: number; minGapMs: number }): Promise<void> {
  if (Date.now() - lastSweep < minGapMs) return;
  lastSweep = Date.now();
  const db = sql();
  const pending = await db<{ reference: string }[]>`
    select reference from payments where status = 'pending' and created_at > now() - interval '1 day' order by created_at desc limit 60`.catch(() => []);
  const until = Date.now() + budgetMs;
  for (const p of pending) {
    if (Date.now() > until) break;
    await settle(p.reference).catch(() => null);
  }
  // a paid build still queued a quarter of an hour later: the worker never got the wake-up
  if (Date.now() - lastDispatch > 15 * 60_000) {
    const [stale] = await db`select 1 from jobs where kind = 'add_brain' and status = 'queued' and paid_at < now() - interval '15 minutes' limit 1`.catch(() => []);
    if (stale) {
      lastDispatch = Date.now();
      await dispatchJobs();
    }
  }
}
