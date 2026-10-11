import { rpcUrl } from "@/lib/server/solana";

export const dynamic = "force-dynamic";

/** Minimal Solana RPC proxy for the in-browser wallet flow: only what building a transfer needs. */
const ALLOWED = new Set(["getLatestBlockhash", "getAccountInfo", "getMinimumBalanceForRentExemption", "getSignatureStatuses"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { method?: string } | null;
  if (!body?.method || !ALLOWED.has(body.method)) return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "method not allowed" } }, { status: 400 });
  const res = await fetch(rpcUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}
