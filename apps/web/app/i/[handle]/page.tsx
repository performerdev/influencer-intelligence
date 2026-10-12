import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { type BrainSection, type ChatBrain, type ChatHistory, ChatView } from "@/components/chat/ChatView";
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
  let chatBrain: ChatBrain | null = null;
  if (brain) {
    const f = brain.files;
    const s = f.stats;
    chatBrain = {
      version: brain.version,
      createdAt: brain.createdAt,
      promptTokens: brain.promptTokens,
      sections: [...splitSections(f.mind, "mind"), ...splitSections(f.rules, "rules"), { id: "voice", title: "Style", body: stripTitle(f.voice), source: "voice" as const }],
      stats: s
        ? {
            computedAt: s.computed_at,
            callsTotal: s.calls_total,
            callsPriced: s.calls_priced,
            hit7d: s.horizons["7d"].hit_rate,
            median7d: s.horizons["7d"].median_return,
            medianHoldDays: s.median_hold_days,
            holdPairs: s.hold_pairs,
          }
        : null,
      suggestions: suggestionsFor(f.calls.map((c) => c.ticker)),
    };
  }

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

/** "## Section" blocks of a brain file → collapsible items in the left panel. */
function splitSections(md: string, source: "mind" | "rules"): BrainSection[] {
  const parts = md.split(/\n(?=##\s)/).filter((p) => /^##\s/.test(p.trim()));
  return parts
    .map((p, i) => {
      const [head, ...rest] = p.trim().split("\n");
      const title = head.replace(/^##\s*/, "").trim();
      const body = rest.join("\n").trim();
      return { id: `${source}-${i}`, title: source === "rules" && !/rule/i.test(title) ? `${title} rules`.replace(/ and taking profit rules$/i, " rules") : title, body, source };
    })
    .filter((s) => s.body && !/^no stated rule\.?$/i.test(s.body));
}

const stripTitle = (md: string) => md.replace(/^#\s.*\n+/, "").trim();

/** Prompts built from this brain's own data (most-called tickers), rotated by the chat. */
function suggestionsFor(tickers: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of tickers) if (t !== "CA") counts.set(t, (counts.get(t) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return [
    "Who are you?",
    top[0] ? `Would you buy $${top[0]} here?` : "Would you buy this dip?",
    "What's your rule for taking profit?",
    top[1] ? `Still holding $${top[1]}?` : "How long do you hold a winner?",
    "How do you size a position?",
    "What would make you sell everything?",
    "What's the trade you regret most?",
  ];
}
