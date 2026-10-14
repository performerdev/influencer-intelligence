import { payments, plusPaymentsEnabled } from "@/config/payments";
import { currentUser } from "@/lib/server/auth";
import { sql } from "@/lib/server/data";
import { json } from "@/lib/server/http";
import { addConfigured, existingFor, normalizeHandle, quote, validHandle } from "@/lib/server/jobs";
import { logError } from "@/lib/server/ops";
import { checkoutInfo, uniqueAmount } from "@/lib/server/plus";
import { newReference } from "@/lib/server/solana";

export const dynamic = "force-dynamic";

/** POST { handle } → a build job waiting for payment, and its USDC checkout. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return json({ error: "Log in with X first." }, 401);
  if (!addConfigured() || !plusPaymentsEnabled()) return json({ error: "Adding brains opens shortly." }, 503);
  const b = (await req.json().catch(() => null)) as { handle?: string } | null;
  const handle = normalizeHandle(String(b?.handle ?? ""));
  if (!validHandle(handle)) return json({ error: "That doesn't look like an X handle." }, 400);
  try {
    const existing = await existingFor(handle);
    if (existing?.kind === "live") return json({ error: `@${existing.handle} already has a brain.`, exists: true, handle: existing.handle }, 409);
    if (existing?.kind === "building") return json({ error: "That brain is already being built.", jobId: existing.jobId }, 409);
    // re-quote on the server: the price paid is always the price computed here
    const q = await quote(handle);
    if ("error" in q) return json({ error: q.error }, 404);
    const db = sql();
    const [job] = await db<{ id: string }[]>`
      insert into jobs (kind, handle, status, quote_usd, user_id, profile, breakdown, max_usd)
      values ('add_brain', ${q.handle}, 'awaiting_payment', ${q.priceUsd}, ${user.id}, ${db.json(q.profile as never)}, ${db.json({ ...q.breakdown, estimatedPosts: q.estimatedPosts } as never)}, ${q.maxParseUsd})
      returning id`;
    const reference = newReference();
    await db`insert into payments (user_id, reference, amount_usd, recipient, purpose, job_id) values (${user.id}, ${reference}, ${await uniqueAmount(q.priceUsd)}, ${payments.recipient}, 'add', ${job.id})`;
    return json({ jobId: job.id, checkout: await checkoutInfo(reference) });
  } catch (err) {
    await logError("server", "/api/add/checkout", err, { userId: user.id });
    return json({ error: "Couldn't start the checkout. Try again." }, 500);
  }
}
