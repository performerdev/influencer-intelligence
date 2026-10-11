import { currentUser, isPlus, usageOf, xLoginConfigured } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Who is this, which plan, how much of the session is left. Never returns tokens or secrets. */
export async function GET() {
  const u = await currentUser().catch(() => null);
  return Response.json({
    loginAvailable: xLoginConfigured(),
    user: u ? { handle: u.handle, name: u.name, avatar: u.avatar_url, plus: isPlus(u), plusUntil: u.plus_until } : null,
    usage: usageOf(u),
  });
}
