import { charge, gate } from "@/lib/server/auth";
import { loadBrain } from "@/lib/server/data";
import { clientHash, json } from "@/lib/server/http";
import { logError, overBudget } from "@/lib/server/ops";
import { lookupToken } from "@/lib/server/token";
import { type Holding, rateBag } from "@/lib/server/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 8;

/** POST { handle, holdings: [{ q, share? }] } → what this mind would do with your bag (one model call, from the session). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { handle?: string; holdings?: { q?: string; share?: number | null }[] } | null;
  const handle = String(b?.handle ?? "").replace(/^@/, "");
  const raw = (Array.isArray(b?.holdings) ? b!.holdings : [])
    .map((h) => ({ q: String(h?.q ?? "").trim().slice(0, 200), w: Number(h?.share) }))
    .filter((h) => h.q)
    .slice(0, MAX);
  if (!handle || !raw.length) return json({ error: "Add at least one coin: a ticker or a contract address, with its share." }, 400);

  const brain = await loadBrain(handle);
  if (!brain) return json({ error: `@${handle} has no brain yet.` }, 404);
  const busy = await overBudget();
  if (busy) return json(busy, 503);
  const g = await gate(clientHash(req));
  if (!g.ok) return json(g.body, g.status);
  if (!g.user) return json({ error: "Log in with X to use the tools — it's free.", reason: "login" }, 401);

  // shares: as given (normalised to 100%); coins without one split what's left evenly
  const given = raw.filter((h) => h.w > 0).reduce((s, h) => s + h.w, 0);
  const missing = raw.filter((h) => !(h.w > 0)).length;
  const rest = missing ? Math.max(given ? 0 : 100, 100 - given) / missing : 0;
  const total = given + rest * missing || 1;
  const tokens = await Promise.all(raw.map((h) => lookupToken(h.q, brain.files.calls).catch(() => null)));
  const holdings: Holding[] = raw.map((h, i) => ({ q: h.q, share: (h.w > 0 ? h.w : rest) / total, token: tokens[i] }));

  try {
    const { records, result, cost } = await rateBag(brain, holdings);
    await charge(g.user, cost);
    return json({ holdings, records, result, usedPct: g.usage.sessionUsd ? Math.max(1, Math.round((cost / g.usage.sessionUsd) * 100)) : null });
  } catch (err) {
    await logError("server", "/api/tools/bag", err, { userId: g.user.id });
    return json({ error: "The model didn't answer. Try again in a moment." }, 502);
  }
}
