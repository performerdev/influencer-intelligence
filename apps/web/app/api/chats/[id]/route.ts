import { currentUser } from "@/lib/server/auth";
import { hasDatabase } from "@/lib/server/data";
import { loadChat } from "@/lib/server/history";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET → one of your saved chats, ready to continue in the app or on a mind's chat page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDatabase()) return json({ error: "Not found." }, 404);
  const user = await currentUser().catch(() => null);
  if (!user) return json({ error: "Log in to open your chats." }, 401);
  const saved = await loadChat(user, id).catch(() => null);
  if (!saved) return json({ error: "That chat isn't there anymore." }, 404);
  return Response.json(
    {
      chatId: id,
      kind: saved.kind,
      handles: saved.handles,
      items: saved.items.map((i) => ({ id: i.id, role: i.role, handle: i.handle, content: i.content, verdict: i.verdict, refs: i.refs, brainVersion: i.brainVersion })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
