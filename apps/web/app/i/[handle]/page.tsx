import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { type ChatBrain, ChatView } from "@/components/chat/ChatView";
import { intelligences as launch } from "@/config/intelligences";
import { type BrainFilesLite, toChatBrain } from "@/lib/chat-brain";
import { findIntelligence, hasDatabase, loadBrain, loadIntelligences } from "@/lib/server/data";

// The same page for everyone, cached at the edge and rebuilt at most every hour (brains change about once a week); a saved chat
// (?c=<id>) is per visitor, so ChatView fetches it in the browser.
export const revalidate = 3600;
export const dynamicParams = true;
export const generateStaticParams = () => launch.map((i) => ({ handle: i.handle }));

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const it = await findIntelligence(handle);
  return it ? { title: `${it.code} @${it.handle}`, description: `Talk to the open-source AI model of @${it.handle}, built from public posts. Unofficial, not financial advice.` } : {};
}

export default async function IntelligencePage({ params }: Props) {
  const { handle } = await params;
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

  return (
    <ChatView
      intelligence={{ code: it.code, handle: it.handle, displayName: it.displayName, color: it.color, avatar: it.avatar, postsParsed: it.postsParsed, postsPerDay: it.postsPerDay }}
      brain={chatBrain}
    />
  );
}
