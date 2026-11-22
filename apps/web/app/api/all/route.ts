import { type Call, type ChatMessage, NO_VIEW, OpenAICompatibleLLM, allMindsRouter, allMindsSummary, allMindsTurn, mentionedTickers, tickerContext } from "@ii/brain-core";
import { recordSpend } from "@ii/db";

import { SUMMARY_ROUND } from "@/lib/all-minds";
import { type User, charge, currentUser, gate, usageOf } from "@/lib/server/auth";
import { loadBrain, loadIntelligences, resolveReferences, sql } from "@/lib/server/data";
import { SSE_HEADERS, VERDICT, clientHash, json } from "@/lib/server/http";
import { liveContext } from "@/lib/server/live";
import { logError, noteSpend, overBudget } from "@/lib/server/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One mind per request, so every request fits Netlify's 60s streaming window.
export const maxDuration = 60;

/** At most this many minds answer one question, so a question costs a few answers, not a dozen. */
const MAX_SPEAKERS = 5;
/** Fewer minds than this with calls on the coin: the router adds minds by topic. */
const MIN_SPEAKERS = 3;
const ANSWER_TOKENS = 220;

const model = () => process.env.LLM_MODEL_CHAT ?? process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro";
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

type AskBody = { action: "ask"; message?: string; chatId?: string | null };
type SpeakBody = { action: "speak"; chatId?: string; handle?: string };
type SumBody = { action: "sum"; chatId?: string };

/**
 * "All minds": one question, the minds with a view answer side by side.
 *   ask   → stores the question, picks who answers (minds that called the coin, else by topic)
 *   speak → streams one mind's short answer (the browser asks for all of them at once)
 *   sum   → two or three sentences over the answers: where they agree, where they split
 */
export async function POST(req: Request) {
  let body: AskBody | SpeakBody | SumBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  if (body.action === "ask") return ask(req, body);
  if (body.action === "speak") return speak(body);
  if (body.action === "sum") return sum(body);
  return json({ error: 'action must be "ask", "speak" or "sum"' }, 400);
}

/* ───────────────────────── ask ───────────────────────── */

/** Every ticker any mind ever called, for spotting coins in a question. Read once a few minutes. */
let known: { at: number; tickers: string[] } | null = null;
async function knownTickers(): Promise<string[]> {
  if (known && Date.now() - known.at < 10 * 60_000) return known.tickers;
  const rows = await sql()<{ t: string }[]>`select distinct upper(ticker) as t from calls`;
  known = { at: Date.now(), tickers: rows.map((r) => r.t) };
  return known.tickers;
}

async function ask(req: Request, body: AskBody) {
  const message = String(body.message ?? "").trim();
  if (!message) return json({ error: "Write a message first." }, 400);
  if (message.length > 1000) return json({ error: "Keep messages under 1,000 characters." }, 400);

  const busy = await overBudget();
  if (busy) return json(busy, 503);

  const db = sql();
  const withBrains = await db<{ id: number; code: string; handle: string; one_line_mind: string | null; posts_parsed: number }[]>`
    select i.id, i.code, i.handle, i.one_line_mind, i.posts_parsed from influencers i
    where not coalesce(i.hidden, false) and exists (select 1 from brains b where b.influencer_id = i.id)
    order by i.code`;
  if (withBrains.length < 2) return json({ error: "The minds aren't ready yet." }, 503);

  const client = clientHash(req);
  const g = await gate(client);
  if (!g.ok) return json(g.body, g.status);
  const { user } = g;

  // Same chat while you keep asking here; only your own chats continue.
  const ids = withBrains.map((m) => m.id);
  let chatId: string | null = null;
  if (isUuid(body.chatId)) {
    const [c] = await db<{ id: string; user_id: number | null }[]>`select id, user_id from chats where id = ${body.chatId} and kind = 'all'`;
    if (c && (c.user_id ?? null) === (user?.id ?? null)) chatId = c.id;
  }
  if (chatId) await db`update chats set influencer_ids = ${ids}, updated_at = now() where id = ${chatId}`;
  else [{ id: chatId }] = await db<{ id: string }[]>`insert into chats (kind, influencer_ids, user_id) values ('all', ${ids}, ${user?.id ?? null}) returning id`;
  await db`insert into messages (chat_id, role, content, client_hash, user_id) values (${chatId}, 'user', ${message}, ${client}, ${user?.id ?? null})`;

  // 1. minds that called a coin in the question, most calls first
  const tickers = mentionedTickers((await knownTickers()).map((t) => ({ ticker: t }) as Call), message, 4);
  let picked: number[] = [];
  if (tickers.length) {
    const rows = await db<{ influencer_id: number; n: number; last: Date }[]>`
      select influencer_id, count(*)::int as n, max(called_at) as last from calls
      where upper(ticker) in ${db(tickers)} and influencer_id in ${db(ids)}
      group by influencer_id order by n desc, last desc`;
    picked = rows.slice(0, MAX_SPEAKERS).map((r) => r.influencer_id);
  }
  // 2. not enough of them: the router picks by topic from the one-line minds
  if (picked.length < MIN_SPEAKERS) {
    const codes = await route(message, withBrains, user);
    for (const code of codes) {
      const m = withBrains.find((x) => x.code === code);
      if (m && !picked.includes(m.id) && picked.length < MAX_SPEAKERS) picked.push(m.id);
    }
  }
  // 3. the router failed too: the minds with the most posts
  if (picked.length < MIN_SPEAKERS) {
    for (const m of [...withBrains].sort((a, b) => b.posts_parsed - a.posts_parsed)) {
      if (!picked.includes(m.id) && picked.length < MIN_SPEAKERS) picked.push(m.id);
    }
  }
  const speakers = picked.map((id) => withBrains.find((m) => m.id === id)!.handle);
  return json({ chatId, speakers, tickers });
}

/** One cheap call: which minds have a view on this. Never throws; [] when it can't tell. */
async function route(question: string, minds: { code: string; handle: string; one_line_mind: string | null }[], user: User | null): Promise<string[]> {
  try {
    const llm = new OpenAICompatibleLLM();
    const m = model();
    const res = await llm.complete([{ role: "user", content: allMindsRouter({ minds: minds.map((x) => ({ code: x.code, handle: x.handle, mind: x.one_line_mind })), question, max: MAX_SPEAKERS }) }], {
      model: m,
      json: true,
      temperature: 0,
      maxTokens: 120,
      thinking: "disabled",
    });
    noteSpend(res.usage.costUsd);
    await recordSpend(sql(), { influencerId: null, kind: "llm", units: res.usage.input + res.usage.output, usd: res.usage.costUsd, meta: { step: "all-route", model: m, ...res.usage } });
    await charge(user, res.usage.costUsd);
    const codes = (JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { codes?: unknown }).codes;
    return Array.isArray(codes) ? codes.map(String) : [];
  } catch (err) {
    console.error("all route:", err);
    return [];
  }
}

/* ───────────────────────── speak ───────────────────────── */

async function ownChat(chatId: unknown): Promise<{ chat: { id: string; influencer_ids: number[] }; user: User | null } | Response> {
  if (!isUuid(chatId)) return json({ error: "Bad request." }, 400);
  const [chat] = await sql()<{ id: string; influencer_ids: number[]; user_id: number | null }[]>`select id, influencer_ids, user_id from chats where id = ${chatId} and kind = 'all'`;
  if (!chat) return json({ error: "Chat not found." }, 404);
  const user = await currentUser();
  if ((chat.user_id ?? null) !== (user?.id ?? null)) return json({ error: "Not your chat." }, 403);
  return { chat, user };
}

async function speak(body: SpeakBody) {
  const own = await ownChat(body.chatId);
  if (own instanceof Response) return own;
  const { chat, user } = own;
  const usage = usageOf(user);
  // The question was already allowed at "ask"; logged-in users stop once the session is spent.
  if (user && usage.used >= 1) return json({ error: "Session spent. The rest answer after it refills.", reason: "limit", resetsAt: usage.resetsAt }, 429);
  const brain = body.handle ? await loadBrain(body.handle) : null;
  if (!brain || !chat.influencer_ids.includes(brain.influencerId)) return json({ error: "Not in this chat." }, 400);

  const db = sql();
  const asked = await db<{ id: string; content: string }[]>`select id, content from messages where chat_id = ${chat.id} and role = 'user' order by id desc limit 2`;
  const last = asked[0];
  if (!last) return json({ error: "Ask something first." }, 400);
  // Each mind answers each question once (no paying twice for a replayed request).
  const [{ done }] = await db<{ done: boolean }[]>`
    select exists (select 1 from messages where chat_id = ${chat.id} and role = 'assistant' and id > ${last.id} and influencer_id = ${brain.influencerId}) as done`;
  if (done) return json({ error: "Already answered." }, 409);

  // the question before this one, and what the minds concluded, so a follow-up makes sense
  let earlier: string | null = null;
  if (asked[1]) {
    const [s] = await db<{ content: string }[]>`
      select content from messages where chat_id = ${chat.id} and role = 'assistant' and influencer_id is null and round = ${SUMMARY_ROUND} and id > ${asked[1].id} and id < ${last.id} order by id desc limit 1`;
    earlier = `User asked: ${clip(asked[1].content, 300)}${s ? `\nThe minds concluded: ${clip(s.content, 500)}` : ""}`;
  }

  const others = await db<{ code: string; handle: string }[]>`select code, handle from influencers where id in ${db(chat.influencer_ids)} and id <> ${brain.influencerId} order by code`;
  const tickers = mentionedTickers(brain.files.calls, last.content);
  let turn = allMindsTurn({ me: { code: brain.code, handle: brain.handle }, others: others.map((o) => `@${o.handle}`), question: last.content, earlier });
  const context = tickerContext(brain.files, tickers);
  if (context) turn += `\n\n${context}`;
  const live = await liveContext(brain, last.content);
  if (live) turn += `\n\n${live}`;
  const messages: ChatMessage[] = [
    { role: "system", content: brain.prompt },
    { role: "user", content: turn },
  ];
  const record = recordOn(brain.files, tickers[0]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("meta", { chatId: chat.id, brainVersion: brain.version, code: brain.code, handle: brain.handle, record });
      let full = "";
      let cost = 0;
      try {
        const llm = new OpenAICompatibleLLM();
        const m = model();
        for await (const ev of llm.stream(messages, { model: m, temperature: 0.7, maxTokens: ANSWER_TOKENS, thinking: "disabled" })) {
          if ("delta" in ev) {
            full += ev.delta;
            send("delta", { t: ev.delta });
          } else {
            cost = ev.usage.costUsd;
            noteSpend(cost);
            await recordSpend(db, { influencerId: brain.influencerId, kind: "llm", units: ev.usage.input + ev.usage.output, usd: cost, meta: { step: "all", model: m, ...ev.usage } });
          }
        }
        await charge(user, cost);
        const noView = full.trim().replace(/[.\s]+$/, "").toUpperCase() === NO_VIEW || full.trim().length === 0;
        const verdict = noView ? null : (full.match(VERDICT)?.[1]?.toUpperCase() ?? null);
        const content = noView ? NO_VIEW : full.replace(VERDICT, "").trim();
        const refs = noView ? [] : await resolveReferences(brain, content);
        const [row] = await db<{ id: string }[]>`
          insert into messages (chat_id, role, influencer_id, brain_version, content, verdict, refs, user_id, cost_usd)
          values (${chat.id}, 'assistant', ${brain.influencerId}, ${brain.version}, ${content}, ${verdict}, ${db.json(refs.map((r) => r.postId) as never)}, ${user?.id ?? null}, ${cost})
          returning id`;
        send("done", { verdict, refs, content, noView, messageId: String(row.id) });
      } catch (err) {
        console.error("all speak:", err);
        await logError("server", "/api/all", err, { userId: user?.id });
        send("error", { message: `${brain.code} didn't answer. Try again in a moment.` });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/** This mind's record on one coin, computed from its priced calls (by code, never the model). */
function recordOn(files: { calls: { ticker: string; post_id: string }[]; stats: { per_call?: { post_id: string; ticker: string; r_7d: number | null }[] } | null }, ticker?: string) {
  if (!ticker) return null;
  const key = ticker.toUpperCase();
  const calls = files.calls.filter((c) => c.ticker.replace(/^\$/, "").toUpperCase() === key).length;
  if (!calls) return null;
  const r7 = (files.stats?.per_call ?? []).filter((p) => p.ticker.replace(/^\$/, "").toUpperCase() === key && p.r_7d != null).map((p) => p.r_7d!);
  const sorted = [...r7].sort((a, b) => a - b);
  const med = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  return { ticker: key, calls, priced: r7.length, worked: r7.length ? r7.filter((r) => r > 0).length / r7.length : null, med };
}

/* ───────────────────────── sum ───────────────────────── */

async function sum(body: SumBody) {
  const own = await ownChat(body.chatId);
  if (own instanceof Response) return own;
  const { chat, user } = own;
  const db = sql();
  const [last] = await db<{ id: string; content: string }[]>`select id, content from messages where chat_id = ${chat.id} and role = 'user' order by id desc limit 1`;
  if (!last) return json({ error: "Ask something first." }, 400);
  const [had] = await db<{ content: string }[]>`
    select content from messages where chat_id = ${chat.id} and role = 'assistant' and influencer_id is null and round = ${SUMMARY_ROUND} and id > ${last.id} limit 1`;
  if (had) return json({ summary: had.content });

  const answers = await db<{ handle: string; verdict: string | null; content: string }[]>`
    select i.handle, m.verdict, m.content from messages m join influencers i on i.id = m.influencer_id
    where m.chat_id = ${chat.id} and m.role = 'assistant' and m.id > ${last.id} and m.content <> ${NO_VIEW} order by m.id`;
  // one view needs no summary; none, nothing to sum up
  if (answers.length < 2) return json({ summary: null });

  try {
    const llm = new OpenAICompatibleLLM();
    const m = model();
    const res = await llm.complete(
      [{ role: "user", content: allMindsSummary({ question: last.content, answers: answers.map((a) => ({ handle: a.handle, verdict: a.verdict, text: clip(a.content.replace(/\[post:[^\]]+\]/g, ""), 700) })) }) }],
      { model: m, temperature: 0.3, maxTokens: 160, thinking: "disabled" },
    );
    noteSpend(res.usage.costUsd);
    await recordSpend(db, { influencerId: null, kind: "llm", units: res.usage.input + res.usage.output, usd: res.usage.costUsd, meta: { step: "all-sum", model: m, ...res.usage } });
    await charge(user, res.usage.costUsd);
    const summary = res.text.trim();
    if (!summary) return json({ summary: null });
    await db`
      insert into messages (chat_id, role, content, round, user_id, cost_usd)
      values (${chat.id}, 'assistant', ${summary}, ${SUMMARY_ROUND}, ${user?.id ?? null}, ${res.usage.costUsd})`;
    return json({ summary });
  } catch (err) {
    console.error("all sum:", err);
    await logError("server", "/api/all", err, { userId: user?.id });
    return json({ summary: null });
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
