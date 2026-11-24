import { sql } from "@/lib/server/data";
import { json } from "@/lib/server/http";
import { loadJob } from "@/lib/server/jobs";
import { refreshListings } from "@/lib/server/listings";
import { settle } from "@/lib/server/plus";

export const dynamic = "force-dynamic";

/** GET ?id= → where a brain build is. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  let job = await loadJob(id).catch(() => null);
  if (!job) return json({ error: "Unknown build." }, 404);
  if (job.status === "awaiting_payment") {
    // paid from a phone and came back here: find the transfer now instead of waiting for the sweep
    const [p] = await sql()<{ reference: string }[]>`select reference from payments where job_id = ${job.id} and status <> 'paid' order by created_at desc limit 1`.catch(() => []);
    if (p && (await settle(p.reference).catch(() => null))?.status === "paid") job = (await loadJob(id).catch(() => null)) ?? job;
  }
  if (job.status === "ready") await refreshListings();
  return json(job);
}
