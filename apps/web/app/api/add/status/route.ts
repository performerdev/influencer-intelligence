import { json } from "@/lib/server/http";
import { loadJob } from "@/lib/server/jobs";
import { refreshListings } from "@/lib/server/listings";

export const dynamic = "force-dynamic";

/** GET ?id= → where a brain build is. */
export async function GET(req: Request) {
  const job = await loadJob(new URL(req.url).searchParams.get("id") ?? "").catch(() => null);
  if (!job) return json({ error: "Unknown build." }, 404);
  if (job.status === "ready") await refreshListings();
  return json(job);
}
