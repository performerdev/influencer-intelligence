import type { Metadata } from "next";

import { type GroupHistory, GroupView } from "@/components/group/GroupView";
import { currentUser } from "@/lib/server/auth";
import { hasDatabase, loadIntelligences } from "@/lib/server/data";
import { loadChat } from "@/lib/server/history";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Group",
  description: "Put 2–4 intelligences in one chat and watch them answer and argue with each other.",
};

export default async function GroupPage({ searchParams }: { searchParams: Promise<{ with?: string; c?: string }> }) {
  const { with: w, c } = await searchParams;
  const all = await loadIntelligences();
  const available = all.filter((i) => i.distilledAt);
  const wanted = (w ?? "").split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
  const initial = wanted
    .map((h) => available.find((i) => i.handle.toLowerCase() === h))
    .filter((i): i is (typeof available)[number] => !!i)
    .slice(0, 4)
    .map((i) => i.handle);
  // ?c=<chat id> reopens one of your saved group chats
  let history: GroupHistory | null = null;
  let lineup = initial;
  if (c && hasDatabase()) {
    const user = await currentUser().catch(() => null);
    const saved = user ? await loadChat(user, c).catch(() => null) : null;
    if (saved?.kind === "group") {
      history = { chatId: c, items: saved.items.map((i) => ({ role: i.role, handle: i.handle, content: i.content, verdict: i.verdict, refs: i.refs, round: i.round })) };
      lineup = saved.handles.filter((h) => available.some((a) => a.handle === h));
    }
  }
  return <GroupView available={available} initial={lineup} history={history} />;
}
