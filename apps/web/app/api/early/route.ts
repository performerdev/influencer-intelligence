import { currentUser } from "@/lib/server/auth";
import { earlyAction, earlyState } from "@/lib/server/early";
import { json } from "@/lib/server/http";
import { logError } from "@/lib/server/ops";

export const dynamic = "force-dynamic";

/** Where this visitor is with their early $ii allocation. */
export async function GET() {
  const user = await currentUser().catch(() => null);
  try {
    return json(await earlyState(user));
  } catch (e) {
    await logError("server", "/api/early", e, { userId: user?.id });
    return json({ error: "Early Mind is out for a second. Try again." }, 500);
  }
}

/** Save the wallet, tick a task, or check the reply link; answers with the new state. */
export async function POST(req: Request) {
  const user = await currentUser().catch(() => null);
  if (!user) return json({ error: "Log in with X first.", reason: "login" }, 401);
  const body = (await req.json().catch(() => null)) as { action?: string; wallet?: string; task?: string; url?: string } | null;
  try {
    const r = await earlyAction(user, body);
    if (!r.ok) return json({ error: r.error }, r.status);
    return json(await earlyState(user));
  } catch (e) {
    await logError("server", "/api/early", e, { userId: user.id });
    return json({ error: "That didn't save. Try again." }, 500);
  }
}
