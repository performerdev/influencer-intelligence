import "server-only";

import { payments } from "@/config/payments";
import { plans } from "@/config/plans";

import { sql } from "./data";
import { dispatchJobs } from "./jobs";
import { findPayment, incomingSince, receivedIn, toUnits, transferUrl, validSignature } from "./solana";

/**
 * Plus checkouts. A checkout is a random reference key tied to one account.
 * The payer's wallet adds that key to the USDC transfer; we then find the
 * transfer on Solana by the key and turn Plus on for the account that owns
 * it. Knowing a reference only lets someone pay for that account, so the
 * pay page and the status check don't need a login (a wallet's own browser
 * has none).
 *
 * Plain transfers work too (copy the address, send from any wallet or
 * exchange): every checkout gets its own amount, a few hundredths of a cent
 * apart (10.0371), and a transfer of exactly that amount after the checkout
 * started is matched to it. Sent a different amount? The payer pastes the
 * transaction signature instead.
 */

const PRICE_STEPS = 10_000; // 4 decimals

/** The price plus a small unique tail, so a plain transfer of exactly this amount points at one checkout. */
export async function uniqueAmount(base: number): Promise<number> {
  const db = sql();
  for (let i = 0; i < 20; i++) {
    const amount = (Math.round(base * PRICE_STEPS) + 1 + Math.floor(Math.random() * 998)) / PRICE_STEPS;
    const [taken] = await db`select 1 from payments where amount_usd = ${amount} and status = 'pending' and created_at > now() - interval '2 days' limit 1`;
    if (!taken) return amount;
  }
  return base + 0.0999;
}

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
  const [p] = await db<PaymentRow[]>`
    select id, user_id, status, amount_usd, created_at, signature, coalesce(purpose, 'plus') as purpose, job_id from payments where reference = ${ref}`;
  if (!p) return { status: "unknown" };
  if (p.status === "paid") return { status: "paid", signature: p.signature ?? undefined };

  let signature: string | null = null;
  try {
    signature = await findPayment(ref, Number(p.amount_usd));
    // no reference on-chain: a plain transfer of exactly this checkout's amount, made after it started
    if (!signature) signature = await findPlainTransfer(Number(p.amount_usd), new Date(p.created_at));
  } catch (err) {
    console.error("plus settle:", err);
    return { status: "pending", note: "Couldn't reach Solana, retrying." };
  }
  if (!signature) {
    // checkouts expire after a day; a late payment can still be matched from the reference
    if (Date.now() - new Date(p.created_at).getTime() > 86_400_000) await db`update payments set status = 'expired' where id = ${p.id} and status = 'pending'`;
    return { status: "pending" };
  }
  return markPaid(p, signature);
}

type PaymentRow = { id: number; user_id: number; status: string; amount_usd: string; created_at: Date; signature: string | null; purpose: string; job_id: string | null };

async function findPlainTransfer(amountUsd: number, createdAt: Date): Promise<string | null> {
  const need = toUnits(amountUsd);
  const since = Math.floor(createdAt.getTime() / 1000) - 120;
  const hits = (await incomingSince(since)).filter((t) => t.units === need);
  if (!hits.length) return null;
  const used = await sql()<{ signature: string }[]>`select signature from payments where signature in ${sql()(hits.map((h) => h.signature))}`;
  return hits.find((h) => !used.some((u) => u.signature === h.signature))?.signature ?? null;
}

/**
 * "I sent it, here's the transaction": for transfers that don't match the
 * exact amount (an exchange took its fee from it, a rounded amount). It must
 * pay the recipient at least the price, after the checkout started, and not
 * be claimed by another checkout.
 */
export async function claimSignature(ref: string, sig: string): Promise<{ status: "paid" | "pending" | "unknown"; error?: string; signature?: string }> {
  if (!validRef(ref)) return { status: "unknown" };
  sig = sig.trim();
  if (!validSignature(sig)) return { status: "pending", error: "That doesn't look like a Solana transaction signature." };
  const db = sql();
  const [p] = await db<PaymentRow[]>`
    select id, user_id, status, amount_usd, created_at, signature, coalesce(purpose, 'plus') as purpose, job_id from payments where reference = ${ref}`;
  if (!p) return { status: "unknown" };
  if (p.status === "paid") return { status: "paid", signature: p.signature ?? undefined };
  const [other] = await db`select 1 from payments where signature = ${sig}`;
  if (other) return { status: "pending", error: "That transaction has already been used for a payment." };
  let tx;
  try {
    tx = await receivedIn(sig);
  } catch {
    return { status: "pending", error: "Couldn't reach Solana. Try again in a moment." };
  }
  if (!tx) return { status: "pending", error: "No USDC to our address in that transaction yet. If you just sent it, wait a few seconds and try again." };
  if (tx.time && tx.time < Math.floor(new Date(p.created_at).getTime() / 1000) - 600) return { status: "pending", error: "That transaction is older than this checkout." };
  // the base price (10, not 10.0371): the unique tail only exists for automatic matching
  if (tx.units < toUnits(Math.floor(Number(p.amount_usd)))) return { status: "pending", error: `That transaction sent ${Number(tx.units) / 1e6} USDC; this checkout needs ${Math.floor(Number(p.amount_usd))}.` };
  return markPaid(p, sig);
}

/** Record the payment and switch on what it pays for (once). */
async function markPaid(p: PaymentRow, signature: string): Promise<{ status: "paid"; signature: string }> {
  const db = sql();
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
