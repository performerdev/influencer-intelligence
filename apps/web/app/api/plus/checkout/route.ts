import { payments, plusPaymentsEnabled } from "@/config/payments";
import { plans } from "@/config/plans";
import { currentUser } from "@/lib/server/auth";
import { sql } from "@/lib/server/data";
import { checkoutInfo } from "@/lib/server/plus";
import { newReference } from "@/lib/server/solana";

export const dynamic = "force-dynamic";

/** Start a Plus checkout: a USDC transfer request on Solana, tied to this account by a reference key. */
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in with X first." }, { status: 401 });
  if (!plusPaymentsEnabled()) return Response.json({ error: "Payments coming soon." }, { status: 503 });
  const reference = newReference();
  await sql()`insert into payments (user_id, reference, amount_usd, recipient) values (${user.id}, ${reference}, ${plans.plus.priceUsd}, ${payments.recipient})`;
  return Response.json(await checkoutInfo(reference));
}

/** GET ?ref=… — a checkout's details, for the pay page opened inside a wallet app. */
export async function GET(req: Request) {
  const info = await checkoutInfo(new URL(req.url).searchParams.get("ref") ?? "");
  if (!info) return Response.json({ error: "Unknown checkout." }, { status: 404 });
  return Response.json(info);
}
