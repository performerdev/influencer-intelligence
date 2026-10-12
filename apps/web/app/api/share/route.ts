import { currentUser, siteOrigin } from "@/lib/server/auth";
import { clientHash, json } from "@/lib/server/http";
import { logError } from "@/lib/server/ops";
import { createShare } from "@/lib/server/share";

export const dynamic = "force-dynamic";

/** POST { messageId } → a public link to that answer (/s/<id>). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { messageId?: string } | null;
  const client = clientHash(req);
  const user = await currentUser().catch(() => null);
  try {
    const r = await createShare(String(b?.messageId ?? ""), user, client);
    if ("error" in r) return json({ error: r.error }, r.status);
    return json({ id: r.id, url: `${siteOrigin(req)}/s/${r.id}` });
  } catch (err) {
    await logError("server", "/api/share", err, { userId: user?.id, clientHash: client });
    return json({ error: "Couldn't create the link." }, 500);
  }
}
