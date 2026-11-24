import { refreshListings } from "@/lib/server/listings";
import { sql } from "@/lib/server/data";
import { json } from "@/lib/server/http";
import { sweep } from "@/lib/server/sweep";

export const dynamic = "force-dynamic";

/**
 * Called by the build worker's schedule (and harmless for anyone else):
 * settles recent payments nobody stayed on the page for, then says whether
 * there are builds waiting — so an idle worker run stops in seconds.
 */
export async function GET() {
  const db = sql();
  // the worker's curl waits 30 s
  await sweep({ budgetMs: 20_000, minGapMs: 30_000 }).catch(() => null);
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from jobs where kind = 'add_brain' and status = 'queued'`;
  // a build just finished: show the new brain on the home page now, not at the next cache refresh
  await refreshListings();
  return json({ queued: n });
}
