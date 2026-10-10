import { requestCostUsd } from "../../../config/pricing";

import { createClient } from "./http";
import type { XPage, XProfile, XSource, XTweet } from "./types";

type Json = Record<string, any>;

/**
 * twitterapi.io adapter (default source).
 * Docs: https://docs.twitterapi.io — auth header X-API-Key, 20 tweets per page,
 * cursor pagination via has_next_page / next_cursor.
 */
export class TwitterApiIoSource implements XSource {
  readonly name = "twitterapi.io";
  private request: ReturnType<typeof createClient>;
  private base: string;

  constructor(
    private apiKey = process.env.TWITTERAPI_IO_KEY ?? "",
    base = process.env.TWITTERAPI_IO_BASE_URL ?? "https://api.twitterapi.io",
  ) {
    if (!apiKey) throw new Error("TWITTERAPI_IO_KEY is not set.");
    this.base = base.replace(/\/$/, "");
    this.request = createClient({ minIntervalMs: Number(process.env.TWITTERAPI_IO_MIN_INTERVAL_MS ?? 250) });
  }

  private get(path: string, params: Record<string, string | boolean | undefined | null>) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.set(k, String(v));
    return this.request(`${this.base}${path}?${qs}`, { headers: { "X-API-Key": this.apiKey } }) as Promise<Json>;
  }

  async profile(handle: string): Promise<XProfile> {
    const j = await this.get("/twitter/user/info", { userName: handle });
    const u: Json = j.data ?? j.user ?? j;
    if (!u?.id) throw new Error(`twitterapi.io: no profile for @${handle} (${j.msg ?? j.message ?? "empty response"})`);
    return {
      id: String(u.id),
      handle: u.userName ?? handle,
      name: u.name ?? null,
      bio: u.description ?? u.profile_bio?.description ?? null,
      followers: num(u.followers),
      statusesCount: num(u.statusesCount),
      createdAt: date(u.createdAt),
    };
  }

  async timeline({ userId, handle, cursor }: { userId: string; handle: string; cursor?: string | null }): Promise<XPage> {
    const j = await this.get("/twitter/user/last_tweets", {
      userId,
      userName: userId ? undefined : handle,
      cursor: cursor ?? "",
      includeReplies: false,
    });
    return this.page(j);
  }

  async search({ query, cursor }: { query: string; cursor?: string | null }): Promise<XPage> {
    const j = await this.get("/twitter/tweet/advanced_search", { query, queryType: "Latest", cursor: cursor ?? "" });
    return this.page(j);
  }

  private page(j: Json): XPage {
    if (j.status === "error") throw new Error(`twitterapi.io: ${j.message ?? j.msg ?? "error"}`);
    const raw: Json[] = j.tweets ?? j.data?.tweets ?? [];
    const tweets = raw.map(normalize).filter((t): t is XTweet => !!t);
    const hasNext = Boolean(j.has_next_page ?? j.data?.has_next_page);
    const next = j.next_cursor ?? j.data?.next_cursor ?? null;
    return {
      tweets,
      nextCursor: hasNext && next ? String(next) : null,
      billed: raw.length,
      costUsd: requestCostUsd(raw.length),
    };
  }
}

function normalize(t: Json): XTweet | null {
  if (!t?.id || t.type === "ad") return null;
  const created = date(t.createdAt ?? t.created_at);
  if (!created) return null;
  const q: Json | null = t.quoted_tweet ?? t.quotedTweet ?? null;
  const rt: Json | null = t.retweeted_tweet ?? t.retweetedTweet ?? null;
  return {
    id: String(t.id),
    text: String(t.text ?? t.full_text ?? ""),
    createdAt: created,
    authorId: t.author?.id ? String(t.author.id) : null,
    authorHandle: t.author?.userName ?? null,
    isReply: Boolean(t.isReply ?? t.inReplyToId),
    inReplyToId: t.inReplyToId ? String(t.inReplyToId) : null,
    inReplyToUserId: t.inReplyToUserId ? String(t.inReplyToUserId) : null,
    conversationId: t.conversationId ? String(t.conversationId) : null,
    isRetweet: Boolean(rt),
    quoted: q?.id ? { id: String(q.id), text: String(q.text ?? ""), author: q.author?.userName ?? null } : null,
    metrics: {
      likes: num(t.likeCount),
      reposts: num(t.retweetCount),
      replies: num(t.replyCount),
      quotes: num(t.quoteCount),
      views: num(t.viewCount),
    },
    lang: t.lang ?? null,
    raw: t,
  };
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? null : n;
}

function date(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
