import { claimSignature } from "@/lib/server/plus";

export const dynamic = "force-dynamic";

// a few tries per visitor per minute is plenty; each one is a Solana lookup
const tries = new Map<string, number[]>();

/**
 * POST { ref, signature } — "I sent it, here's the transaction." For plain
 * transfers that didn't arrive as the checkout's exact amount.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const now = Date.now();
  const recent = (tries.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 8) return Response.json({ error: "Too many tries. Wait a minute." }, { status: 429 });
  if (tries.size > 5000) tries.clear();
  tries.set(ip, [...recent, now]);

  const b = (await req.json().catch(() => null)) as { ref?: string; signature?: string } | null;
  const r = await claimSignature(String(b?.ref ?? ""), String(b?.signature ?? ""));
  if (r.status === "unknown") return Response.json({ error: "Unknown checkout." }, { status: 404 });
  return Response.json(r, { status: r.error ? 400 : 200 });
}
