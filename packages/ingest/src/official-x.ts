import { createClient } from "./http";
import type { XPage, XProfile, XSource, XTweet } from "./types";

type Json = Record<string, any>;

const TWEET_FIELDS = "created_at,public_metrics,conversation_id,in_reply_to_user_id,referenced_tweets,lang,author_id,note_tweet";

/**
 * Official X API v2 adapter. Drop-in replacement for twitterapi.io:
 * set X_SOURCE=official and X_BEARER_TOKEN. Full-archive search needs an
 * access tier that includes /2/tweets/search/all; otherwise recent search is used.
 * Cost per returned post is configurable (X_API_PRICE_PER_POST) because it
 * depends on your plan.
 */
export class OfficialXSource implements XSource {
  readonly name = "x-api-v2";
  private request = createClient({ minIntervalMs: Number(process.env.X_API_MIN_INTERVAL_MS ?? 1000) });
  private base = (process.env.X_API_BASE_URL ?? "https://api.x.com").replace(/\/$/, "");
  private pricePerPost = Number(process.env.X_API_PRICE_PER_POST ?? 0);

  constructor(private token = process.env.X_BEARER_TOKEN ?? "") {
    if (!token) throw new Error("X_BEARER_TOKEN is not set.");
  }

  private get(path: string, params: Record<string, string | undefined | null>) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return this.request(`${this.base}${path}?${qs}`, { headers: { Authorization: `Bearer ${this.token}` } }) as Promise<Json>;
  }

  async profile(handle: string): Promise<XProfile> {
    const j = await this.get(`/2/users/by/username/${encodeURIComponent(handle)}`, {
      "user.fields": "created_at,description,public_metrics",
    });
    const u = j.data;
    if (!u?.id) throw new Error(`X API: no profile for @${handle}`);
    return {
      id: u.id,
      handle: u.username,
      name: u.name ?? null,
      bio: u.description ?? null,
      followers: u.public_metrics?.followers_count ?? null,
      statusesCount: u.public_metrics?.tweet_count ?? null,
      createdAt: u.created_at ? new Date(u.created_at) : null,
    };
  }

  async timeline({ userId, cursor }: { userId: string; handle: string; cursor?: string | null }): Promise<XPage> {
    const j = await this.get(`/2/users/${userId}/tweets`, {
      max_results: "100",
      exclude: "replies,retweets",
      "tweet.fields": TWEET_FIELDS,
      expansions: "referenced_tweets.id,referenced_tweets.id.author_id",
      "user.fields": "username",
      pagination_token: cursor ?? undefined,
    });
    return this.page(j);
  }

  async search({ query, cursor }: { query: string; cursor?: string | null }): Promise<XPage> {
    const path = process.env.X_API_FULL_ARCHIVE === "true" ? "/2/tweets/search/all" : "/2/tweets/search/recent";
    // X API uses start_time/end_time instead of until_time:
    const m = query.match(/until_time:(\d+)/);
    const q = query.replace(/\s*until_time:\d+/, "").replace(/-filter:replies/, "-is:reply").replace(/(^|\s)filter:replies/, "$1is:reply");
    const j = await this.get(path, {
      query: q,
      max_results: "100",
      end_time: m ? new Date(Number(m[1]) * 1000).toISOString() : undefined,
      "tweet.fields": TWEET_FIELDS,
      expansions: "referenced_tweets.id,referenced_tweets.id.author_id",
      "user.fields": "username",
      next_token: cursor ?? undefined,
    });
    return this.page(j);
  }

  async tweetsByIds(ids: string[]): Promise<XPage> {
    if (!ids.length) return { tweets: [], nextCursor: null, billed: 0, costUsd: 0 };
    const j = await this.get("/2/tweets", {
      ids: ids.slice(0, 100).join(","),
      "tweet.fields": TWEET_FIELDS,
      expansions: "author_id,referenced_tweets.id,referenced_tweets.id.author_id",
      "user.fields": "username",
    });
    return this.page(j);
  }

  private page(j: Json): XPage {
    const included: Json[] = j.includes?.tweets ?? [];
    const users = new Map<string, string>((j.includes?.users ?? []).map((u: Json) => [u.id, u.username]));
    const byId = new Map(included.map((t) => [t.id, t]));
    const data: Json[] = j.data ?? [];
    const tweets: XTweet[] = data.map((t) => {
      const refs: Json[] = t.referenced_tweets ?? [];
      const q = refs.find((r) => r.type === "quoted");
      const replied = refs.find((r) => r.type === "replied_to");
      const qt = q ? byId.get(q.id) : null;
      return {
        id: t.id,
        text: t.note_tweet?.text ?? t.text,
        createdAt: new Date(t.created_at),
        authorId: t.author_id ?? null,
        authorHandle: users.get(t.author_id) ?? null,
        isReply: Boolean(replied),
        inReplyToId: replied?.id ?? null,
        inReplyToUserId: t.in_reply_to_user_id ?? null,
        inReplyToHandle: t.in_reply_to_user_id ? users.get(t.in_reply_to_user_id) ?? null : null,
        conversationId: t.conversation_id ?? null,
        isRetweet: refs.some((r) => r.type === "retweeted"),
        quoted: q ? { id: q.id, text: qt?.text ?? "", author: qt ? users.get(qt.author_id) ?? null : null } : null,
        metrics: {
          likes: t.public_metrics?.like_count ?? null,
          reposts: t.public_metrics?.retweet_count ?? null,
          replies: t.public_metrics?.reply_count ?? null,
          quotes: t.public_metrics?.quote_count ?? null,
          views: t.public_metrics?.impression_count ?? null,
        },
        lang: t.lang ?? null,
        raw: t,
      };
    });
    return {
      tweets,
      nextCursor: j.meta?.next_token ?? null,
      billed: data.length,
      costUsd: data.length * this.pricePerPost,
    };
  }
}
