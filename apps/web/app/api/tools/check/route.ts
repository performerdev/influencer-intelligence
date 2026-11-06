import { charge, gate } from "@/lib/server/auth";
import { loadBrain } from "@/lib/server/data";
import { clientHash, json } from "@/lib/server/http";
import { logError, overBudget } from "@/lib/server/ops";
import { lookupToken } from "@/lib/server/token";
import { checkCoin } from "@/lib/server/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { handle, q } → the coin's live data and whether this mind would buy it (one model call, from the session). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { handle?: string; q?: string } | null;
  const handle = String(b?.handle ?? "").replace(/^@/, "");
  const q = String(b?.q ?? "").trim().slice(0, 300);
  if (!handle || !q) return json({ error: "Paste a ticker, a contract address or a link." }, 400);

  const brain = await loadBrain(handle);
  if (!brain) return json({ error: `@${handle} has no brain yet.` }, 404);
  const busy = await overBudget();
  if (busy) return json(busy, 503);
  const g = await gate(clientHash(req));
  if (!g.ok) return json(g.body, g.status);
  if (!g.user) return json({ error: "Log in with X to use the tools — it's free.", reason: "login" }, 401);

  const token = await lookupToken(q, brain.files.calls);
  if (!token) return json({ error: "Couldn't find that coin. Try its contract address or a DexScreener link." }, 404);
  try {
    const { record, result, cost } = await checkCoin(brain, token);
    await charge(g.user, cost);
    return json({ token, record, result, usedPct: g.usage.sessionUsd ? Math.max(1, Math.round((cost / g.usage.sessionUsd) * 100)) : null });
  } catch (err) {
    await logError("server", "/api/tools/check", err, { userId: g.user.id });
    return json({ error: "The model didn't answer. Try again in a moment." }, 502);
  }
}
