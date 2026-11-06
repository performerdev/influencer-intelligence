import { currentUser } from "@/lib/server/auth";
import { hasDatabase } from "@/lib/server/data";
import { listChats } from "@/lib/server/history";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET → your recent chats, newest first (loaded by the app after the page, so the page itself stays fast). */
export async function GET() {
  if (!hasDatabase()) return json({ chats: [] });
  const user = await currentUser().catch(() => null);
  if (!user) return json({ chats: [] }, 401);
  const chats = await listChats(user).catch(() => []);
  return Response.json(
    { chats: chats.map(({ id, kind, handles, title, updatedAt }) => ({ id, kind, handles, title, updatedAt })) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
