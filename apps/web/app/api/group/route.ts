import { type ChatMessage, OpenAICompatibleLLM, type GroupLine, groupTurn, mentionedTickers, tickerContext } from "@ii/brain-core";
import { recordSpend } from "@ii/db";

import { intelligences } from "@/config/intelligences";
import { loadBrain, resolveReferences, sql } from "@/lib/server/data";
import { SSE_HEADERS, VERDICT, clientHash, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One speaker per request, so every request fits Netlify's 60s streaming window.
export const maxDuration = 60;

const DAILY_LIMIT = Number(process.env.CHAT_DAILY_LIMIT ?? 40);
const MIN_MEMBERS = 2;
const MAX_MEMBERS = 4;
const DEBATE_ROUNDS = 2;
const TRANSCRIPT_MESSAGES = 30;
const ANSWER_TOKENS = Number(process.env.GROUP_MAX_TOKENS ?? 450);
const DEBATE_TOKENS = Number(process.env.GROUP_DEBATE_MAX_TOKENS ?? 260);

type AskBody = { action: "ask"; members?: string[]; message?: string; debate?: boolean; chatId?: string | null };
type SpeakBody = { action: "speak"; chatId?: string; handle?: string; round?: number };

const byHandle = new Map(intelligences.map((i) => [i.handle.toLowerCase(), i]));
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

/**
 * Group chat in two steps:
 *   ask   → stores the question, returns the speaking order (who answers, which round)
 *   speak → streams one intelligence's turn, with the transcript so far
 * The browser walks the queue one speaker at a time, so it reads like a conversation.
 */
export async function POST(req: Request) {
  let body: AskBody | SpeakBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  if (body.action === "ask") return ask(req, body);
  if (body.action === "speak") return speak(body);
  return json({ error: 'action must be "ask" or "speak"' }, 400);
}

async function ask(req: Request, body: AskBody) {
  const message = String(body.message ?? "").trim();
  if (!message) return json({ error: "Write a message first." }, 400);
  if (message.length > 1000) return json({ error: "Keep messages under 1,000 characters." }, 400);

  const handles = [...new Set((body.members ?? []).map((h) => String(h).replace(/^@/, "").toLowerCase()))];
  const members = handles.map((h) => byHandle.get(h)).filter((m): m is (typeof intelligences)[number] => !!m);
  if (members.length < MIN_MEMBERS || members.length > MAX_MEMBERS) return json({ error: `Pick ${MIN_MEMBERS}–${MAX_MEMBERS} intelligences.` }, 400);

  const db = sql();
  const rows = await db<{ id: number; handle: string; has_brain: boolean }[]>`
    select i.id, i.handle, exists (select 1 from brains b where b.influencer_id = i.id) as has_brain
    from influencers i where lower(i.handle) in ${db(members.map((m) => m.handle.toLowerCase()))}`;
  const missing = members.filter((m) => !rows.find((r) => r.handle.toLowerCase() === m.handle.toLowerCase() && r.has_brain));
  if (missing.length) return json({ error: `${missing.map((m) => `@${m.handle}`).join(", ")} has no brain yet.` }, 400);
  const ids = members.map((m) => rows.find((r) => r.handle.toLowerCase() === m.handle.toLowerCase())!.id);

  const client = clientHash(req);
  const [{ n }] = await db<{ n: number }[]>`
    select count(*)::int as n from messages where client_hash = ${client} and role = 'user' and created_at > now() - interval '24 hours'`;
  if (n >= DAILY_LIMIT) return json({ error: `That's the daily limit of ${DAILY_LIMIT} free questions. Come back tomorrow.` }, 429);

  // Same chat while the members stay the same; a new lineup starts a new chat.
  let chatId: string | null = null;
  if (isUuid(body.chatId)) {
    const [c] = await db<{ id: string; influencer_ids: number[] }[]>`select id, influencer_ids from chats where id = ${body.chatId} and kind = 'group'`;
    if (c && [...c.influencer_ids].sort().join() === [...ids].sort().join()) chatId = c.id;
  }
  if (!chatId) {
    const [c] = await db<{ id: string }[]>`insert into chats (kind, influencer_ids) values ('group', ${ids}) returning id`;
    chatId = c.id;
  }
  await db`insert into messages (chat_id, role, content, client_hash) values (${chatId}, 'user', ${message}, ${client})`;

  // "@ii-04" or "@handle" asks only those; otherwise everyone, in lineup order.
  const mentioned = members.filter((m) => new RegExp(`@(${escape(m.handle)}|${escape(m.code)})\\b`, "i").test(message));
  const speakers = mentioned.length ? mentioned : members;
  const debate = Boolean(body.debate) && speakers.length > 1;
  const queue: { handle: string; round: number }[] = [];
  for (let round = 0; round <= (debate ? DEBATE_ROUNDS : 0); round++) for (const m of speakers) queue.push({ handle: m.handle, round });

  return json({ chatId, queue, rounds: debate ? DEBATE_ROUNDS : 0 });
}

async function speak(body: SpeakBody) {
  const round = Number(body.round ?? 0);
  if (!isUuid(body.chatId) || !body.handle || !Number.isInteger(round) || round < 0 || round > DEBATE_ROUNDS) return json({ error: "Bad request." }, 400);
  const db = sql();
  const [chat] = await db<{ id: string; influencer_ids: number[] }[]>`select id, influencer_ids from chats where id = ${body.chatId} and kind = 'group'`;
  if (!chat) return json({ error: "Chat not found." }, 404);
  const brain = await loadBrain(body.handle);
  if (!brain || !chat.influencer_ids.includes(brain.influencerId)) return json({ error: "Not in this chat." }, 400);

  const [last] = await db<{ id: string; content: string }[]>`
    select id, content from messages where chat_id = ${chat.id} and role = 'user' order by id desc limit 1`;
  if (!last) return json({ error: "Ask something first." }, 400);
  // Each speaker answers each round of a question once (no paying twice for a replayed request).
  const [{ done }] = await db<{ done: boolean }[]>`
    select exists (select 1 from messages where chat_id = ${chat.id} and role = 'assistant' and id > ${last.id}
      and influencer_id = ${brain.influencerId} and round = ${round}) as done`;
  if (done) return json({ error: "Already answered." }, 409);

  const members = await db<{ id: number; code: string; handle: string }[]>`
    select id, code, handle from influencers where id in ${db(chat.influencer_ids)}`;
  const name = new Map(members.map((m) => [m.id, `${m.code} (@${m.handle})`]));
  const rows = await db<{ role: string; influencer_id: number | null; content: string }[]>`
    select role, influencer_id, content from messages where chat_id = ${chat.id} order by id desc limit ${TRANSCRIPT_MESSAGES}`;
  const transcript: GroupLine[] = rows.reverse().map((r) => ({
    speaker: r.role === "user" ? "User" : (name.get(r.influencer_id!) ?? "?"),
    text: clip(r.content, 1200),
  }));

  const order = chat.influencer_ids.map((id) => members.find((m) => m.id === id)!).filter(Boolean);
  let turn = groupTurn({ me: { code: brain.code, handle: brain.handle }, members: order, transcript, round, rounds: DEBATE_ROUNDS });
  const context = tickerContext(brain.files, mentionedTickers(brain.files.calls, last.content));
  if (context) turn += `\n\n${context}`;
  const messages: ChatMessage[] = [
    { role: "system", content: brain.prompt },
    { role: "user", content: turn },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("meta", { chatId: chat.id, brainVersion: brain.version, code: brain.code, handle: brain.handle, round });
      let full = "";
      try {
        const llm = new OpenAICompatibleLLM();
        const model = process.env.LLM_MODEL_CHAT ?? process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro";
        for await (const ev of llm.stream(messages, { model, temperature: 0.75, maxTokens: round ? DEBATE_TOKENS : ANSWER_TOKENS, thinking: "disabled" })) {
          if ("delta" in ev) {
            full += ev.delta;
            send("delta", { t: ev.delta });
          } else {
            await recordSpend(db, { influencerId: brain.influencerId, kind: "llm", units: ev.usage.input + ev.usage.output, usd: ev.usage.costUsd, meta: { step: "group", model, round, ...ev.usage } });
          }
        }
        // Models sometimes echo the "ii-01 (@handle):" transcript prefix; drop it.
        const verdict = full.match(VERDICT)?.[1]?.toUpperCase() ?? null;
        const content = full.replace(VERDICT, "").replace(new RegExp(`^\\s*${escape(brain.code)}\\s*(\\(@?${escape(brain.handle)}\\))?\\s*:\\s*`, "i"), "").trim();
        const refs = await resolveReferences(brain, content);
        await db`
          insert into messages (chat_id, role, influencer_id, brain_version, content, verdict, refs, round)
          values (${chat.id}, 'assistant', ${brain.influencerId}, ${brain.version}, ${content}, ${verdict}, ${db.json(refs.map((r) => r.postId) as never)}, ${round})`;
        send("done", { verdict, refs, content });
      } catch (err) {
        console.error("group:", err);
        send("error", { message: `${brain.code} didn't answer. Try again in a moment.` });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
