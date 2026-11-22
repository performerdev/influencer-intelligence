import { currentUser, isPlus, usageOf, xLoginConfigured } from "@/lib/server/auth";
import { setShowAddedBy } from "@/lib/server/community";
import { refreshListings } from "@/lib/server/listings";
import { shareBonusAvailable } from "@/lib/server/share";

export const dynamic = "force-dynamic";

/** Who is this, which plan, how much of the session is left. Never returns tokens or secrets. */
export async function GET() {
  const u = await currentUser().catch(() => null);
  return Response.json({
    loginAvailable: xLoginConfigured(),
    user: u ? { handle: u.handle, name: u.name, avatar: u.avatar_url, plus: isPlus(u), plusUntil: u.plus_until } : null,
    // percentages and times only — budgets stay server-side
    usage: (({ plan, used, resetsAt, capped, debate, unlimited }) => ({ plan, used, resetsAt, capped, debate, unlimited }))(usageOf(u)),
    // post an answer on X → a free 2-hour session, once a day
    shareBonus: u ? { available: shareBonusAvailable(u) } : null,
  });
}

/** Your settings. For now one: show "Added by @you" on the minds you added. */
export async function POST(req: Request) {
  const u = await currentUser().catch(() => null);
  if (!u) return Response.json({ error: "Log in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { showAddedBy?: unknown } | null;
  if (typeof b?.showAddedBy !== "boolean") return Response.json({ error: "Nothing to change." }, { status: 400 });
  try {
    await setShowAddedBy(u.id, b.showAddedBy);
  } catch {
    return Response.json({ error: "That didn't save. Try again in a few minutes." }, { status: 503 });
  }
  await refreshListings(true);
  return Response.json({ ok: true, showAddedBy: b.showAddedBy });
}
