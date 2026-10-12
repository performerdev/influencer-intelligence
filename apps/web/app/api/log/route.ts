import { currentUser } from "@/lib/server/auth";
import { sql } from "@/lib/server/data";
import { clientHash, json } from "@/lib/server/http";
import { logError } from "@/lib/server/ops";

export const dynamic = "force-dynamic";

/** Browser errors → the admin log. Rate-limited per visitor. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { message?: string; detail?: string; path?: string } | null;
  const message = String(b?.message ?? "").slice(0, 500);
  if (!message) return json({ ok: false }, 400);
  const client = clientHash(req);
  try {
    const [{ n }] = await sql()<{ n: number }[]>`select count(*)::int as n from errors where client_hash = ${client} and at > now() - interval '1 hour'`;
    if (n >= 20) return json({ ok: true });
  } catch {
    return json({ ok: true });
  }
  const user = await currentUser().catch(() => null);
  await logError("client", String(b?.path ?? "").slice(0, 200), { message, stack: b?.detail }, { userId: user?.id, clientHash: client });
  return json({ ok: true });
}
