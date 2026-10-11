import "server-only";

import { plans } from "@/config/plans";

import { type User, isPlus } from "./auth";
import { type Reference, loadBrain, resolveReferences, sql } from "./data";

export type ChatSummary = {
  id: string;
  kind: "single" | "group";
  handles: string[];
  title: string;
  messages: number;
  updatedAt: string;
};

export type HistoryItem = {
  role: "user" | "assistant";
  handle: string | null;
  content: string;
  verdict: "BUY" | "SELL" | "HOLD" | "PASS" | null;
  refs: Reference[];
  round: number;
  brainVersion: number | null;
};

/** Your chats, newest first. Free keeps 7 days, Plus keeps everything. */
export async function listChats(user: User): Promise<ChatSummary[]> {
  const days = isPlus(user) ? plans.plus.historyDays : plans.free.historyDays;
  const rows = await sql()<{ id: string; kind: string; handles: string[]; title: string | null; n: number; updated_at: Date }[]>`
    select c.id, c.kind,
      (select array_agg(i.handle order by array_position(c.influencer_ids, i.id)) from influencers i where i.id = any(c.influencer_ids)) as handles,
      (select content from messages m where m.chat_id = c.id and m.role = 'user' order by m.id limit 1) as title,
      (select count(*)::int from messages m where m.chat_id = c.id) as n,
      c.updated_at
    from chats c
    where c.user_id = ${user.id} ${days != null ? sql()`and c.updated_at > now() - make_interval(days => ${days})` : sql()``}
    order by c.updated_at desc limit 100`;
  return rows
    .filter((r) => r.n > 0)
    .map((r) => ({
      id: r.id,
      kind: r.kind === "group" ? "group" : "single",
      handles: r.handles ?? [],
      title: (r.title ?? "").slice(0, 140),
      messages: r.n,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
}

/** One of your chats, ready to continue: messages with their references resolved. */
export async function loadChat(user: User, id: string): Promise<{ kind: "single" | "group"; handles: string[]; items: HistoryItem[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = sql();
  const [c] = await db<{ kind: string; influencer_ids: number[] }[]>`select kind, influencer_ids from chats where id = ${id} and user_id = ${user.id}`;
  if (!c) return null;
  const members = await db<{ id: number; handle: string }[]>`select id, handle from influencers where id = any(${c.influencer_ids})`;
  const handleOf = new Map(members.map((m) => [m.id, m.handle]));
  const rows = await db<{ role: "user" | "assistant"; influencer_id: number | null; content: string; verdict: HistoryItem["verdict"]; round: number; brain_version: number | null }[]>`
    select role, influencer_id, content, verdict, round, brain_version from messages where chat_id = ${id} order by id limit 200`;
  const items: HistoryItem[] = [];
  for (const r of rows) {
    const handle = r.influencer_id ? (handleOf.get(r.influencer_id) ?? null) : null;
    let refs: Reference[] = [];
    if (r.role === "assistant" && handle) {
      const brain = await loadBrain(handle, r.brain_version ?? undefined).catch(() => null);
      if (brain) refs = await resolveReferences(brain, r.content).catch(() => []);
    }
    items.push({ role: r.role, handle: r.role === "assistant" ? handle : null, content: r.content, verdict: r.verdict, refs, round: r.round ?? 0, brainVersion: r.brain_version });
  }
  return { kind: c.kind === "group" ? "group" : "single", handles: c.influencer_ids.map((i) => handleOf.get(i)!).filter(Boolean), items };
}
