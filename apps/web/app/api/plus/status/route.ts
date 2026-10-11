import { settle } from "@/lib/server/plus";

export const dynamic = "force-dynamic";

/**
 * GET /api/plus/status?ref=… — has this checkout been paid on-chain?
 * When it has: Plus for 30 days (stacked on any time left) for the account
 * that started the checkout.
 */
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const r = await settle(ref);
  if (r.status === "unknown") return Response.json({ error: "Unknown checkout." }, { status: 404 });
  return Response.json(r);
}
