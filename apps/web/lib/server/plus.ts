import "server-only";

import { payments } from "@/config/payments";
import { plans } from "@/config/plans";

import { sql } from "./data";
import { dispatchJobs } from "./jobs";
import { findPayment, transferUrl } from "./solana";

/**
 * Plus checkouts. A checkout is a random reference key tied to one account.
 * The payer's wallet adds that key to the USDC transfer; we then find the
 * transfer on Solana by the key and turn Plus on for the account that owns
 * it. Knowing a reference only lets someone pay for that account, so the
 * pay page and the status check don't need a login (a wallet's own browser
 * has none).
 */

export type CheckoutInfo = {
  reference: string;
  amount: number;
  token: string;
  mint: string;
  decimals: number;
  recipient: string;
  url: string;
  handle: string;
  status: string;
  /** plus | add */
  purpose: string;
  /** what is being paid for, shown on the pay page */
  label: string;
  jobId: string | null;
};

const validRef = (ref: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ref);

export async function checkoutInfo(ref: string): Promise<CheckoutInfo | null> {
  if (!validRef(ref)) return null;
  const [p] = await sql()<{ amount_usd: string; recipient: string; status: string; handle: string; purpose: string; job_id: string | null; job_handle: string | null }[]>`
    select p.amount_usd, p.recipient, p.status, u.handle, coalesce(p.purpose, 'plus') as purpose, p.job_id, j.handle as job_handle
    from payments p join users u on u.id = p.user_id left join jobs j on j.id = p.job_id where p.reference = ${ref}`;
  if (!p) return null;
  const amount = Number(p.amount_usd);
  const label = p.purpose === "add" ? `Add @${p.job_handle}'s brain` : `Plus · ${plans.plus.days} days · @${p.handle}`;
  return {
    reference: ref,
    amount,
    token: payments.token,
    mint: payments.mint,
    decimals: payments.decimals,
    recipient: p.recipient,
    url: transferUrl(ref, amount, label),
    handle: p.handle,
    status: p.status,
    purpose: p.purpose,
    label,
    jobId: p.job_id,
  };
}

/** Look for the payment on-chain; when it's there, turn Plus on (once). */
export async function settle(ref: string): Promise<{ status: "paid" | "pending" | "unknown"; signature?: string; note?: string }> {
  if (!validRef(ref)) return { status: "unknown" };
  const db = sql();
  const [p] = await db<{ id: number; user_id: number; status: string; amount_usd: string; created_at: Date; signature: string | null; purpose: string; job_id: string | null }[]>`
    select id, user_id, status, amount_usd, created_at, signature, coalesce(purpose, 'plus') as purpose, job_id from payments where reference = ${ref}`;
  if (!p) return { status: "unknown" };
  if (p.status === "paid") return { status: "paid", signature: p.signature ?? undefined };

  let signature: string | null = null;
  try {
    signature = await findPayment(ref, Number(p.amount_usd));
  } catch (err) {
    console.error("plus settle:", err);
    return { status: "pending", note: "Couldn't reach Solana, retrying." };
  }
  if (!signature) {
    // checkouts expire after a day; a late payment can still be matched from the reference
    if (Date.now() - new Date(p.created_at).getTime() > 86_400_000) await db`update payments set status = 'expired' where id = ${p.id} and status = 'pending'`;
    return { status: "pending" };
  }
  let added = false;
  await db.begin(async (tx) => {
    const [claimed] = await tx`update payments set status = 'paid', signature = ${signature}, paid_at = now() where id = ${p.id} and status <> 'paid' returning id`;
    if (!claimed) return;
    if (p.purpose === "add") {
      // a paid "Add a brain": into the build queue
      if (p.job_id) await tx`update jobs set status = 'queued', paid_at = now(), paid_tx = ${signature}, updated_at = now() where id = ${p.job_id} and status = 'awaiting_payment'`;
      added = true;
      return;
    }
    await tx`
      update users set
        plus_until = greatest(coalesce(plus_until, now()), now()) + make_interval(days => ${plans.plus.days}),
        plus_spent_usd = case when plus_until is null or plus_until < now() then 0 else plus_spent_usd end
      where id = ${p.user_id}`;
  });
  if (added) await dispatchJobs();
  return { status: "paid", signature };
}
