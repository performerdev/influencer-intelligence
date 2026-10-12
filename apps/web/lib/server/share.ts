import "server-only";

import { randomBytes } from "node:crypto";

import { plans } from "@/config/plans";

import { type User, isPlus } from "./auth";
import { sql } from "./data";

/**
 * Shared answers. A share is a public page (/s/<id>) with one question and
 * its answer — never the account that asked. Posting it on X earns a free
 * 2-hour session once a day.
 */

export const BONUS_HOURS = 2;
const BONUS_EVERY_HOURS = 24;

const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const newId = () => Array.from(randomBytes(9), (b) => ALPHABET[b % ALPHABET.length]).join("");

export const shareBonusAvailable = (u: User) => !u.share_bonus_at || Date.now() - new Date(u.share_bonus_at).getTime() > BONUS_EVERY_HOURS * 3600_000;

/** Share one of your answers (logged in: your chats; guest: chats you asked in from this browser). */
export async function createShare(messageId: string, user: User | null, client: string): Promise<{ id: string } | { error: string; status: number }> {
  if (!/^\d+$/.test(messageId)) return { error: "Bad message.", status: 400 };
  const db = sql();
  const [m] = await db<{ id: string; chat_id: string; user_id: number | null; owner: number | null }[]>`
    select m.id, m.chat_id, m.user_id, c.user_id as owner from messages m join chats c on c.id = m.chat_id
    where m.id = ${messageId} and m.role = 'assistant'`;
  if (!m) return { error: "Answer not found.", status: 404 };
  const mine = user
    ? m.owner === user.id
    : m.owner == null && (await db`select 1 from messages where chat_id = ${m.chat_id} and role = 'user' and client_hash = ${client} limit 1`).length > 0;
  if (!mine) return { error: "You can only share your own answers.", status: 403 };
  const [existing] = await db<{ id: string }[]>`select id from shares where message_id = ${messageId}`;
  if (existing) return { id: existing.id };
  const id = newId();
  await db`insert into shares (id, message_id, user_id, client_hash) values (${id}, ${messageId}, ${user?.id ?? null}, ${client}) on conflict (message_id) do nothing`;
  const [row] = await db<{ id: string }[]>`select id from shares where message_id = ${messageId}`;
  return { id: row.id };
}

export type SharedAnswer = {
  id: string;
  handle: string;
  code: string;
  question: string | null;
  answer: string;
  verdict: string | null;
  createdAt: string;
  others: string[];
};

/** What a share page shows. */
export async function loadShare(id: string, countView = false): Promise<SharedAnswer | null> {
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return null;
  const db = sql();
  const [r] = await db<{ id: string; message_id: string; chat_id: string; content: string; verdict: string | null; created_at: Date; handle: string; code: string; hidden: boolean; influencer_ids: number[] }[]>`
    select s.id, m.id as message_id, m.chat_id, m.content, m.verdict, m.created_at, i.handle, i.code, coalesce(i.hidden, false) as hidden, c.influencer_ids
    from shares s join messages m on m.id = s.message_id join influencers i on i.id = m.influencer_id join chats c on c.id = m.chat_id
    where s.id = ${id}`;
  if (!r || r.hidden) return null;
  const [q] = await db<{ content: string }[]>`
    select content from messages where chat_id = ${r.chat_id} and role = 'user' and id < ${r.message_id} order by id desc limit 1`;
  const others =
    r.influencer_ids.length > 1
      ? (await db<{ handle: string }[]>`select handle from influencers where id = any(${r.influencer_ids}) and lower(handle) <> lower(${r.handle})`).map((o) => o.handle)
      : [];
  if (countView) await db`update shares set views = views + 1 where id = ${id}`.catch(() => {});
  return {
    id: r.id,
    handle: r.handle,
    code: r.code,
    question: q?.content ?? null,
    answer: r.content,
    verdict: r.verdict,
    createdAt: new Date(r.created_at).toISOString(),
    others,
  };
}

/** Has this X account posted a link to the share? Checks its latest posts (twitterapi.io). null = can't check. */
async function postedOnX(handle: string, shareId: string): Promise<boolean | null> {
  const key = process.env.TWITTERAPI_IO_KEY;
  if (!key) return null;
  const base = (process.env.TWITTERAPI_IO_BASE_URL ?? "https://api.twitterapi.io").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}&includeReplies=true`, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(6000) });
    const j = await res.json();
    const tweets: any[] = j?.data?.tweets ?? j?.tweets ?? [];
    const needle = `/s/${shareId}`;
    return tweets.some((t) => {
      const urls: string[] = [...(t?.entities?.urls ?? []).map((u: any) => String(u?.expanded_url ?? u?.url ?? "")), String(t?.text ?? "")];
      return urls.some((u) => u.includes(needle));
    });
  } catch {
    return null;
  }
}

/**
 * Claim the free session for posting a share: resets session usage, and the
 * session runs for at least BONUS_HOURS from now. Once per day per account.
 */
export async function claimShareBonus(user: User, shareId: string): Promise<{ ok: true; resetsAt: string } | { error: string; status: number; retry?: boolean }> {
  if (!shareBonusAvailable(user)) return { error: "You've already used today's free session. Come back tomorrow.", status: 409 };
  const db = sql();
  const [s] = await db<{ id: string; user_id: number | null; claimed_at: Date | null }[]>`select id, user_id, claimed_at from shares where id = ${shareId}`;
  if (!s || s.user_id !== user.id) return { error: "Share one of your own answers first.", status: 403 };
  if (s.claimed_at) return { error: "This post was already counted.", status: 409 };
  const posted = await postedOnX(user.handle, shareId);
  if (posted === false) return { error: "We can't see the post on your X yet — give it a minute and try again.", status: 409, retry: true };
  const hours = isPlus(user) ? plans.plus.sessionHours : plans.free.sessionHours;
  const keep = Math.max(0, hours - BONUS_HOURS);
  type Row = { session_started_at: Date };
  const [u] = (await db
    .begin(async (tx) => {
      const [claimed] = await tx`update shares set claimed_at = now() where id = ${shareId} and claimed_at is null returning id`;
      if (!claimed) return [] as Row[];
      const rows = await tx<Row[]>`
      update users set
        session_spent_usd = 0,
        -- a fresh budget that lasts at least 2 hours (longer if the current session already does)
        session_started_at = case when session_started_at > now() - make_interval(hours => ${keep}) then session_started_at else now() - make_interval(hours => ${keep}) end,
        share_bonus_at = now()
      where id = ${user.id} and (share_bonus_at is null or share_bonus_at < now() - make_interval(hours => ${BONUS_EVERY_HOURS}))
      returning session_started_at`;
      // a second claim racing this one: roll the share mark back too
      if (!rows.length) throw new Error("already claimed");
      return rows;
    })
    .catch(() => [] as Row[])) as Row[];
  if (!u) return { error: "Already counted.", status: 409 };
  return { ok: true, resetsAt: new Date(new Date(u.session_started_at).getTime() + hours * 3600_000).toISOString() };
}
