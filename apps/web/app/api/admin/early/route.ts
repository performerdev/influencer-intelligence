import { currentUser } from "@/lib/server/auth";
import { earlyCsv } from "@/lib/server/early";
import { isAdmin } from "@/lib/server/ops";

export const dynamic = "force-dynamic";

/** Every early allocation as CSV, for the snapshot. Admins only. */
export async function GET() {
  const user = await currentUser().catch(() => null);
  if (!isAdmin(user)) return new Response("Not found", { status: 404 });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(await earlyCsv(), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="early-${day}.csv"`, "Cache-Control": "no-store" },
  });
}
