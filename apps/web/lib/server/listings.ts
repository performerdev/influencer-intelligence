import "server-only";

import { revalidatePath } from "next/cache";

import { sql } from "./data";

let lastCheck = 0;
let seen = "";

/**
 * The home page is cached (ISR). When the set of brains changes — a paid build
 * went live, an admin hid or showed one — refresh it right away instead of at
 * the next cache expiry. Cheap to call often: it looks at the database at most
 * every 15s, and only revalidates when the newest ready build is one it hasn't
 * seen yet. `force` revalidates unconditionally (admin actions).
 */
export async function refreshListings(force = false): Promise<void> {
  try {
    if (!force) {
      if (Date.now() - lastCheck < 15_000) return;
      lastCheck = Date.now();
      const [row] = await sql()<{ id: string | null }[]>`
        select id from jobs where kind = 'add_brain' and status = 'ready' and finished_at > now() - interval '1 hour' order by finished_at desc limit 1`;
      if (!row?.id || row.id === seen) return;
      seen = row.id;
    }
    revalidatePath("/");
  } catch (err) {
    console.error("refreshListings:", (err as Error)?.message ?? err);
  }
}
