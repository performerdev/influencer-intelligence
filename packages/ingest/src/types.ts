/** Normalized X post, whatever the source. */
export type XTweet = {
  id: string;
  text: string;
  createdAt: Date;
  authorId: string | null;
  authorHandle: string | null;
  isReply: boolean;
  inReplyToId: string | null;
  inReplyToUserId: string | null;
  inReplyToHandle: string | null;
  conversationId: string | null;
  isRetweet: boolean;
  quoted: { id: string; text: string; author: string | null } | null;
  metrics: { likes: number | null; reposts: number | null; replies: number | null; quotes: number | null; views: number | null };
  lang: string | null;
  raw: unknown;
};

export type XProfile = {
  id: string;
  handle: string;
  name: string | null;
  bio: string | null;
  followers: number | null;
  statusesCount: number | null;
  createdAt: Date | null;
};

export type XPage = {
  tweets: XTweet[];
  nextCursor: string | null;
  /** items the provider bills for on this request */
  billed: number;
  /** USD cost of this request */
  costUsd: number;
};

/**
 * A source of public X posts. twitterapi.io is the default; the official X
 * API adapter implements the same interface so either can be swapped in.
 */
export interface XSource {
  readonly name: string;
  profile(handle: string): Promise<XProfile>;
  /** The account's own posts (originals + quotes), newest first, no replies. */
  timeline(args: { userId: string; handle: string; cursor?: string | null }): Promise<XPage>;
  /** Search with X operators (from:, to:, until_time:, …), newest first. */
  search(args: { query: string; cursor?: string | null }): Promise<XPage>;
  /** Specific posts by id (used for the post a reply answers). */
  tweetsByIds(ids: string[]): Promise<XPage>;
}

export type PostKind = "post" | "quote" | "thread" | "reply";

/**
 * What we keep: originals, quotes, and the author's own thread continuations.
 * Reposts are always dropped; replies to other people only when asked for.
 */
export function classify(t: XTweet, selfId: string | null, opts: { replies?: boolean } = {}): PostKind | null {
  if (t.isRetweet || /^RT @\w+:/.test(t.text)) return null;
  if (selfId && t.authorId && t.authorId !== selfId) return null;
  if (t.isReply) {
    if (selfId && t.inReplyToUserId === selfId) return "thread";
    return opts.replies && isSubstantive(t.text) ? "reply" : null;
  }
  return t.quoted ? "quote" : "post";
}

/** "gm", "lol", "@x 🔥" carry no signal; keep replies with something to say. */
export function isSubstantive(text: string, minChars = Number(process.env.REPLIES_MIN_CHARS ?? 20)): boolean {
  const body = text
    .replace(/^(@\w+\s*)+/, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
  return Array.from(body).length >= minChars;
}
