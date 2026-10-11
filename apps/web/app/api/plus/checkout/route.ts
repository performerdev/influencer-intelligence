import { payments, plusPaymentsEnabled } from "@/config/payments";
import { plans } from "@/config/plans";
import { currentUser } from "@/lib/server/auth";
import { sql } from "@/lib/server/data";
import { newReference, transferUrl } from "@/lib/server/solana";

export const dynamic = "force-dynamic";

/** Start a Plus checkout: a Solana Pay transfer request for 10 USDC, tied to this account by a reference key. */
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in with X first." }, { status: 401 });
  if (!plusPaymentsEnabled()) return Response.json({ error: "Payments coming soon." }, { status: 503 });
  const reference = newReference();
  const amount = plans.plus.priceUsd;
  await sql()`insert into payments (user_id, reference, amount_usd, recipient) values (${user.id}, ${reference}, ${amount}, ${payments.recipient})`;
  return Response.json({
    reference,
    amount,
    token: payments.token,
    mint: payments.mint,
    decimals: payments.decimals,
    recipient: payments.recipient,
    url: transferUrl(reference, amount, `Plus · ${plans.plus.days} days · @${user.handle}`),
  });
}
