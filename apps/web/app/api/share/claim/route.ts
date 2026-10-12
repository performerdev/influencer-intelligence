import { currentUser } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { logError } from "@/lib/server/ops";
import { claimShareBonus } from "@/lib/server/share";

export const dynamic = "force-dynamic";

/** POST { shareId } → posted it on X? Then a free 2-hour session (once a day). */
export async function POST(req: Request) {
  const user = await currentUser().catch(() => null);
  if (!user) return json({ error: "Log in with X first." }, 401);
  const b = (await req.json().catch(() => null)) as { shareId?: string } | null;
  try {
    const r = await claimShareBonus(user, String(b?.shareId ?? ""));
    if ("error" in r) return json({ error: r.error, retry: r.retry ?? false }, r.status);
    return json(r);
  } catch (err) {
    await logError("server", "/api/share/claim", err, { userId: user.id });
    return json({ error: "Couldn't add the session. Try again." }, 500);
  }
}
