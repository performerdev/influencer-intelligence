import { currentUser } from "@/lib/server/auth";
import { sql } from "@/lib/server/data";
import { saveEarlySettings } from "@/lib/server/early";
import { json } from "@/lib/server/http";
import { dispatchJobs } from "@/lib/server/jobs";
import { refreshListings } from "@/lib/server/listings";
import { isAdmin } from "@/lib/server/ops";

export const dynamic = "force-dynamic";

/** Admin actions from /admin. Everything here is a deliberate click by an admin. */
export async function POST(req: Request) {
  const user = await currentUser().catch(() => null);
  if (!isAdmin(user)) return json({ error: "Not found." }, 404);
  const b = (await req.json().catch(() => null)) as { action?: string; id?: string; handle?: string; xHandle?: string; launchUrl?: string } | null;
  const db = sql();
  const id = String(b?.id ?? "");
  switch (b?.action) {
    case "takedown-handled":
      await db`update takedown_requests set status = 'handled', handled_at = now() where id = ${id}`;
      return json({ ok: true });
    case "takedown-reopen":
      await db`update takedown_requests set status = 'open', handled_at = null where id = ${id}`;
      return json({ ok: true });
    case "hide":
      await db`update influencers set hidden = true where lower(handle) = lower(${String(b?.handle ?? "")})`;
      await refreshListings(true);
      return json({ ok: true });
    case "unhide":
      await db`update influencers set hidden = false where lower(handle) = lower(${String(b?.handle ?? "")})`;
      await refreshListings(true);
      return json({ ok: true });
    case "job-retry":
      await db`update jobs set status = 'queued', error = null, updated_at = now() where id = ${id} and status in ('failed', 'queued')`;
      await dispatchJobs();
      return json({ ok: true });
    case "job-refunded":
      await db`update jobs set status = 'refunded', updated_at = now() where id = ${id} and status = 'failed'`;
      return json({ ok: true });
    case "early-settings": {
      // the project's X account (follow task) and the launch post (repost and reply tasks)
      const xHandle = String(b?.xHandle ?? "").trim().replace(/^@/, "");
      const m = String(b?.launchUrl ?? "").trim().match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/);
      if (xHandle && !/^[A-Za-z0-9_]{1,15}$/.test(xHandle)) return json({ error: "That's not an X handle." }, 400);
      if (String(b?.launchUrl ?? "").trim() && !m) return json({ error: "Paste the link to the post: x.com/<handle>/status/<id>." }, 400);
      await saveEarlySettings(xHandle, m ? `https://x.com/${m[1]}/status/${m[2]}` : "");
      return json({ ok: true });
    }
    case "errors-clear":
      await db`delete from errors where at < now() - interval '1 hour'`;
      return json({ ok: true });
    default:
      return json({ error: "Unknown action." }, 400);
  }
}
