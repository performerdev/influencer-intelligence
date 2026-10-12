import { currentUser } from "@/lib/server/auth";
import { sql } from "@/lib/server/data";
import { clientHash, json } from "@/lib/server/http";
import { logError } from "@/lib/server/ops";

export const dynamic = "force-dynamic";

const KINDS = new Set(["self", "representative", "account", "other"]);

/** Store a removal / data-deletion request for a person to review. Nothing is removed here. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { kind?: string; handle?: string; contact?: string; proof?: string; reason?: string } | null;
  const kind = String(b?.kind ?? "");
  const contact = String(b?.contact ?? "").trim().slice(0, 200);
  const proof = String(b?.proof ?? "").trim().slice(0, 500);
  const reason = String(b?.reason ?? "").trim().slice(0, 2000);
  const handle = String(b?.handle ?? "").replace(/^@/, "").trim().slice(0, 50);
  if (!KINDS.has(kind)) return json({ error: "Pick what you're asking for." }, 400);
  if (!contact) return json({ error: "Tell us how to reach you." }, 400);
  if (kind !== "other" && !proof) return json({ error: "Add a link that shows it's you." }, 400);
  if (kind !== "account" && !handle) return json({ error: "Pick the brain." }, 400);

  const client = clientHash(req);
  const db = sql();
  try {
    const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from takedown_requests where client_hash = ${client} and created_at > now() - interval '1 day'`;
    if (n >= 5) return json({ error: "That's a lot of requests from here today — we already have them." }, 429);
    const user = await currentUser().catch(() => null);
    await db`
      insert into takedown_requests (handle, proof_url, contact, reason, note, client_hash, user_id)
      values (${kind === "account" ? `account:${user?.handle ?? contact}` : handle}, ${proof || "—"}, ${contact}, ${reason || null}, ${kind}, ${client}, ${user?.id ?? null})`;
    return json({ ok: true });
  } catch (err) {
    await logError("server", "/api/takedown", err, { clientHash: client });
    return json({ error: "Couldn't save it. Try again in a moment." }, 500);
  }
}
