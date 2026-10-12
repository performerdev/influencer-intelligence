import { sql } from "@/lib/server/data";
import { json } from "@/lib/server/http";
import { settle } from "@/lib/server/plus";

export const dynamic = "force-dynamic";

let last = 0;

/**
 * Called by the build worker's schedule (and harmless for anyone else):
 * settles recent payments nobody stayed on the page for, then says whether
 * there are builds waiting — so an idle worker run stops in seconds.
 */
export async function GET() {
  const db = sql();
  if (Date.now() - last > 30_000) {
    last = Date.now();
    const pending = await db<{ reference: string }[]>`
      select reference from payments where status = 'pending' and created_at > now() - interval '1 day' order by created_at desc limit 20`.catch(() => []);
    for (const p of pending) await settle(p.reference).catch(() => null);
  }
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from jobs where kind = 'add_brain' and status = 'queued'`;
  return json({ queued: n });
}
