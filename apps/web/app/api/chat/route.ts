import { type ChatMessage, OpenAICompatibleLLM, mentionedTickers, tickerContext } from "@ii/brain-core";
import { recordSpend } from "@ii/db";

import { charge, gate } from "@/lib/server/auth";
import { loadBrain, resolveReferences, sql } from "@/lib/server/data";
import { SSE_HEADERS, VERDICT, clientHash, json } from "@/lib/server/http";
import { liveContext } from "@/lib/server/live";
import { logError, noteSpend, overBudget } from "@/lib/server/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Netlify streams up to 60s; one intelligence's answer fits well inside that.
export const maxDuration = 60;

const HISTORY_TURNS = 16;

type Body = { handle?: string; chatId?: string | null; message?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Send JSON: { handle, message, chatId? }" }, 400);
  }
  const message = String(body.message ?? "").trim();
  const handle = String(body.handle ?? "").replace(/^@/, "");
  if (!handle || !message) return json({ error: "Both handle and message are required." }, 400);
  if (message.length > 1000) return json({ error: "Keep questions under 1,000 characters." }, 400);

  const brain = await loadBrain(handle);
  if (!brain) return json({ error: `@${handle} has no brain yet. It appears here as soon as it's distilled.` }, 404);

  // Daily ceiling on model spend across the whole site.
  const busy = await overBudget();
  if (busy) return json(busy, 503);

  const db = sql();
  const client = clientHash(req);
  // Guests: one message, then log in. Logged in: a session budget in real model cost.
  const g = await gate(client);
  if (!g.ok) return json(g.body, g.status);
  const { user, usage } = g;

  // Conversation: history comes from the database, never from the client — and only from your own chats.
  let chatId = body.chatId && /^[0-9a-f-]{36}$/i.test(body.chatId) ? body.chatId : null;
  let history: ChatMessage[] = [];
  if (chatId) {
    const [owner] = await db<{ user_id: number | null }[]>`select user_id from chats where id = ${chatId} and kind = 'single'`;
    if (!owner || (owner.user_id ?? null) !== (user?.id ?? null)) chatId = null;
  }
  if (chatId) {
    const rows = await db<{ role: "user" | "assistant"; content: string }[]>`
      select role, content from messages where chat_id = ${chatId} order by id desc limit ${HISTORY_TURNS}`;
    history = rows.reverse().map((r) => ({ role: r.role, content: r.content }));
    if (!rows.length) chatId = null;
  }
  if (!chatId) {
    const [c] = await db<{ id: string }[]>`insert into chats (kind, influencer_ids, user_id) values ('single', ${[brain.influencerId]}, ${user?.id ?? null}) returning id`;
    chatId = c.id;
  }
  await db`insert into messages (chat_id, role, influencer_id, content, client_hash, user_id) values (${chatId}, 'user', ${brain.influencerId}, ${message}, ${client}, ${user?.id ?? null})`;
  await db`update chats set updated_at = now() where id = ${chatId}`;

  // Identical first questions within the hour reuse the answer (same brain version).
  const cached = history.length
    ? null
    : (
        await db<{ content: string; verdict: string | null }[]>`
          select a.content, a.verdict from messages u
          join lateral (select content, verdict, brain_version from messages a where a.chat_id = u.chat_id and a.role = 'assistant' and a.id > u.id order by a.id limit 1) a on true
          where u.role = 'user' and u.influencer_id = ${brain.influencerId} and lower(trim(u.content)) = lower(${message})
            and a.brain_version = ${brain.version} and u.created_at > now() - interval '1 hour'
            and not exists (select 1 from messages p where p.chat_id = u.chat_id and p.id < u.id)
          order by u.id desc limit 1`
      )[0] ?? null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("meta", { chatId, brainVersion: brain.version, code: brain.code });
      let full = "";
      let cost = 0;
      try {
        if (cached) {
          for (const piece of cached.content.match(/\S+\s*/g) ?? []) {
            full += piece;
            send("delta", { t: piece });
          }
          if (cached.verdict) full += `\nVERDICT: ${cached.verdict}`;
        } else {
          const llm = new OpenAICompatibleLLM();
          const model = process.env.LLM_MODEL_CHAT ?? process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro";
          // Brain first and identical for every message → provider prompt caching applies.
          // Tickers asked about (here or in the previous question) get their complete call record attached to this turn only,
          // so big brains keep a compact ledger in the cached prompt and still answer specifics exactly.
          const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
          let tickers = mentionedTickers(brain.files.calls, message);
          if (!tickers.length) tickers = mentionedTickers(brain.files.calls, lastUser, 3);
          const context = tickerContext(brain.files, tickers);
          // what the brain can't know: prices now, and posts since it was built
          const live = await liveContext(brain, message);
          const turn = [message, context, live].filter(Boolean).join("\n\n");
          const messages: ChatMessage[] = [{ role: "system", content: brain.prompt }, ...history, { role: "user", content: turn }];
          for await (const ev of llm.stream(messages, { model, temperature: 0.7, maxTokens: usage.maxAnswerTokens, thinking: "disabled" })) {
            if ("delta" in ev) {
              full += ev.delta;
              send("delta", { t: ev.delta });
            } else {
              cost = ev.usage.costUsd;
              noteSpend(cost);
              await recordSpend(db, { influencerId: brain.influencerId, kind: "llm", units: ev.usage.input + ev.usage.output, usd: ev.usage.costUsd, meta: { step: "chat", model, ...ev.usage } });
            }
          }
          await charge(user, cost);
        }
        const verdict = full.match(VERDICT)?.[1]?.toUpperCase() ?? null;
        const content = full.replace(VERDICT, "").trim();
        const refs = await resolveReferences(brain, content);
        const [m] = await db<{ id: string }[]>`
          insert into messages (chat_id, role, influencer_id, brain_version, content, verdict, refs, user_id, cost_usd)
          values (${chatId}, 'assistant', ${brain.influencerId}, ${brain.version}, ${content}, ${verdict}, ${db.json(refs.map((r) => r.postId) as never)}, ${user?.id ?? null}, ${cost})
          returning id`;
        send("done", { verdict, refs, messageId: String(m.id), cached: Boolean(cached) });
      } catch (err) {
        console.error("chat:", err);
        await logError("server", "/api/chat", err, { userId: user?.id, clientHash: client });
        send("error", { message: "The model didn't answer. Try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
