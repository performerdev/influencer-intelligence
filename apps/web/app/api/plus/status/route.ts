import { plans } from "@/config/plans";
import { currentUser } from "@/lib/server/auth";
import { sql } from "@/lib/server/data";
import { findPayment } from "@/lib/server/solana";

export const dynamic = "force-dynamic";

/**
 * GET /api/plus/status?ref=… — has this checkout been paid on-chain?
 * When it has: Plus for 30 days (stacked on any time left), usage period reset.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const db = sql();
  const [p] = await db<{ id: number; status: string; amount_usd: string; created_at: Date }[]>`
    select id, status, amount_usd, created_at from payments where reference = ${ref} and user_id = ${user.id}`;
  if (!p) return Response.json({ error: "Unknown checkout." }, { status: 404 });
  if (p.status === "paid") return Response.json({ status: "paid", plusUntil: user.plus_until });

  let signature: string | null = null;
  try {
    signature = await findPayment(ref, Number(p.amount_usd));
  } catch (err) {
    console.error("plus status:", err);
    return Response.json({ status: "pending", note: "Couldn't reach Solana, retrying." });
  }
  if (!signature) {
    // checkouts expire after a day; a late payment can still be matched by support from the reference
    if (Date.now() - new Date(p.created_at).getTime() > 86_400_000) await db`update payments set status = 'expired' where id = ${p.id} and status = 'pending'`;
    return Response.json({ status: "pending" });
  }
  const [u] = await db.begin(async (tx) => {
    const [claimed] = await tx`update payments set status = 'paid', signature = ${signature}, paid_at = now() where id = ${p.id} and status = 'pending' returning id`;
    if (!claimed) return tx<{ plus_until: Date }[]>`select plus_until from users where id = ${user.id}`;
    return tx<{ plus_until: Date }[]>`
      update users set
        plus_until = greatest(coalesce(plus_until, now()), now()) + make_interval(days => ${plans.plus.days}),
        plus_spent_usd = case when plus_until is null or plus_until < now() then 0 else plus_spent_usd end
      where id = ${user.id} returning plus_until`;
  });
  return Response.json({ status: "paid", signature, plusUntil: u.plus_until });
}
