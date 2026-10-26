import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { type ChatBrain, type ChatHistory, ChatView } from "@/components/chat/ChatView";
import { type BrainFilesLite, toChatBrain } from "@/lib/chat-brain";
import { currentUser } from "@/lib/server/auth";
import { findIntelligence, hasDatabase, loadBrain, loadIntelligences } from "@/lib/server/data";
import { loadChat } from "@/lib/server/history";

// Per visitor (saved chats), so rendered on request; the brain itself is cached in memory.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ c?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const it = await findIntelligence(handle);
  return it ? { title: `${it.code} @${it.handle}`, description: `Talk to the open-source AI model of @${it.handle}, built from public posts. Unofficial, not financial advice.` } : {};
}

export default async function IntelligencePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { c } = await searchParams;
  const all = await loadIntelligences();
  const it = all.find((i) => i.handle.toLowerCase() === handle.toLowerCase());
  if (!it) notFound();

  // one retry: a cold database connection shouldn't make a brain look "not distilled"
  const brain = hasDatabase()
    ? await loadBrain(it.handle)
        .catch(() => loadBrain(it.handle))
        .catch((err) => (console.error("loadBrain:", err), null))
    : null;
  const chatBrain: ChatBrain | null = brain ? toChatBrain({ ...brain, files: brain.files as unknown as BrainFilesLite }) : null;

  // ?c=<chat id> reopens one of your saved chats with this intelligence
  let history: ChatHistory | null = null;
  if (c && hasDatabase()) {
    const user = await currentUser().catch(() => null);
    const saved = user ? await loadChat(user, c).catch(() => null) : null;
    if (saved && saved.kind === "single" && saved.handles[0]?.toLowerCase() === it.handle.toLowerCase()) {
      history = { chatId: c, items: saved.items.map((i) => ({ id: i.id, role: i.role, content: i.content, verdict: i.verdict, refs: i.refs, brainVersion: i.brainVersion })) };
    }
  }

  return (
    <ChatView
      history={history}
      intelligence={{ code: it.code, handle: it.handle, displayName: it.displayName, color: it.color, avatar: it.avatar, postsParsed: it.postsParsed, postsPerDay: it.postsPerDay }}
      brain={chatBrain}
    />
  );
}
