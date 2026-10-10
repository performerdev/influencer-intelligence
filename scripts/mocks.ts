/**
 * Fake account + mock twitterapi.io / OpenAI-compatible / DefiLlama APIs.
 * Used by the pipeline test and by `pnpm dev:mock` (a local site with a real
 * brain built from fake posts, no keys or network needed).
 */
import { createServer } from "node:http";

export const API_PORT = Number(process.env.MOCK_API_PORT ?? 4010);
export const SELF = { id: "42", handle: "blknoiz06" }; // first configured intelligence, so the CLI picks it up

/* ───────────────────────── fake account ───────────────────────── */

export type T = Record<string, any>;
const DAY = 86_400_000;
const start = Date.UTC(2023, 0, 1);
export const SOL_CA = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
const lines = [
  (i: number) => ({ text: `bought more $SOL here. down 20% on no news is a gift (${i})` }),
  (i: number) => ({ text: `sold my $WIF into strength, euphoria is the signal (${i})` }),
  (i: number) => ({ text: `still holding $ETH, nothing changed (${i})` }),
  (i: number) => ({ text: `aped this one, small size ${SOL_CA} (${i})` }),
  (i: number) => ({ text: `markets are a mirror. most of you are trading your mood (${i})` }),
  (i: number) => ({ text: `never marry a bag. ever. (${i})` }),
  (i: number) => ({ text: `ct is loud today, nothing to do (${i})` }),
];
export const tweets: T[] = [];
for (let i = 0; i < 260; i++) {
  const created = new Date(start + i * 3 * DAY);
  const base: T = {
    type: "tweet",
    id: String(1_000_000 + i),
    createdAt: created.toUTCString().replace("GMT", "+0000"),
    likeCount: (i * 37) % 900,
    retweetCount: i % 40,
    replyCount: i % 11,
    quoteCount: i % 5,
    viewCount: 1000 + i * 13,
    lang: "en",
    author: { id: SELF.id, userName: SELF.handle },
    isReply: false,
    retweeted_tweet: null,
    quoted_tweet: null,
  };
  const r = i % 20;
  if (r === 0) tweets.push({ ...base, text: "RT @someone: not ours", retweeted_tweet: { id: "9", text: "not ours" } });
  else if (r === 1) tweets.push({ ...base, text: "@someone lol no", isReply: true, inReplyToId: "8", inReplyToUserId: "777" });
  else if (r === 2) tweets.push({ ...base, text: `and the second part of the thread (${i})`, isReply: true, inReplyToId: String(1_000_000 + i - 1), inReplyToUserId: SELF.id });
  else if (r === 3) tweets.push({ ...base, text: `this is exactly the top signal (${i})`, quoted_tweet: { id: "5", text: "new ATH incoming", author: { userName: "loudguy" } } });
  else tweets.push({ ...base, ...lines[i % lines.length](i) });
}
export const newestFirst = [...tweets].sort((a, b) => Number(b.id) - Number(a.id));
const ts = (t: T) => new Date(t.createdAt).getTime() / 1000;

/* ───────────────────────── mock APIs ───────────────────────── */

export const calls: Record<string, number> = {};
const page = (list: T[], cursor: string | null) => {
  const off = Number(cursor || 0);
  const slice = list.slice(off, off + 20);
  const next = off + 20 < list.length ? String(off + 20) : "";
  return { tweets: slice, has_next_page: Boolean(next), next_cursor: next, status: "success", message: "" };
};

function chat(body: any) {
  const sys: string = body.messages.find((m: any) => m.role === "system")?.content ?? "";
  const user: string = body.messages.find((m: any) => m.role === "user")?.content ?? "";
  const usage = { prompt_tokens: Math.ceil((sys.length + user.length) / 4), completion_tokens: 400, prompt_cache_hit_tokens: 0 };
  if (/single word: ok/.test(user)) return { model: body.model, choices: [{ message: { content: "ok" } }], usage };
  if (sys.includes("one chronological batch")) {
    const posts = [...user.matchAll(/^\[(\d+)\] (\S+) · (.*)$/gm)].map((m) => ({ id: m[1], text: m[3] }));
    const cl = posts.flatMap((p) => {
      const t = p.text.match(/\$([A-Z]+)/)?.[1];
      if (/bought/.test(p.text)) return [{ post_id: p.id, ticker: t, direction: "buy", quote: "bought more $SOL here" }];
      if (/sold/.test(p.text)) return [{ post_id: p.id, ticker: t, direction: "sell", quote: "this quote is not in the post" }];
      if (/still holding/.test(p.text)) return [{ post_id: p.id, ticker: t, direction: "hold", quote: "still holding $ETH" }];
      if (/aped/.test(p.text)) return [{ post_id: p.id, ticker: "CA", direction: "buy", quote: "aped this one" }];
      return [];
    });
    // one hallucinated call on a post that doesn't exist — must be dropped
    cl.push({ post_id: "999999999", ticker: "BTC", direction: "buy", quote: "x" });
    const notes = {
      period: "2023",
      worldview: [{ point: "markets reflect mood", post_ids: [posts[0]?.id] }],
      rules: [{ kind: "exit", rule: "never marry a bag", quote: "never marry a bag", post_ids: [posts[1]?.id] }],
      voice: { phrases: ["never marry a bag"], slang: ["ct"], emoji: "none", sentence_style: "short", humor: "dry", arguing: "blunt", when_wrong: "admits fast" },
      calls: cl,
      examples: posts.slice(0, 12).map((p) => ({ post_id: p.id, topic: "markets", mood: "calm" })),
    };
    return { model: body.model, choices: [{ message: { content: "```json\n" + JSON.stringify(notes) + "\n```" } }], usage };
  }
  if (sys.includes("<one_line_mind>")) {
    const ids = [...user.matchAll(/^(\d{7}) · /gm)].map((m) => m[1]).slice(0, 40);
    const content = `<one_line_mind>Buys fear, sells euphoria, never marries a bag</one_line_mind>
<mind>
# How @${SELF.handle} thinks
## Worldview
Markets mirror mood (post:${ids[0]}).
</mind>
<rules>
# @${SELF.handle}'s rules
## Exit and taking profit
- Never marry a bag — "never marry a bag. ever." (post:${ids[1]})
</rules>
<voice>
# How @${SELF.handle} writes
Short, lowercase, dry.
</voice>
<intro>
1. ii-01 here — an unofficial AI model of @${SELF.handle}, built from public posts. not the real one.
</intro>
<examples>${ids.join(", ")}, 123</examples>`;
    return { model: body.model, choices: [{ message: { content } }], usage };
  }
  return { model: body.model, choices: [{ message: { content: user.slice(0, 200) } }], usage };
}

function prices(coins: Record<string, number[]>) {
  const out: T = {};
  for (const [coin, tss] of Object.entries(coins)) {
    if (coin.startsWith("ethereum:") || coin.startsWith("base:")) continue;
    out[coin] = { symbol: coin, prices: tss.map((t) => ({ timestamp: t, price: 100 + ((t / 86400) % 30), confidence: 0.99 })) };
  }
  return { coins: out };
}

export const api = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://127.0.0.1:${API_PORT}`);
  calls[url.pathname] = (calls[url.pathname] ?? 0) + 1;
  let body = "";
  for await (const chunk of req) body += chunk;
  const send = (j: unknown) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(j));
  };
  const q = url.searchParams;
  if (url.pathname === "/twitter/user/info") {
    if (req.headers["x-api-key"] !== "test-key") return res.writeHead(401).end("bad key");
    return send({ data: { id: SELF.id, userName: SELF.handle, name: "Test Account", followers: 12345, statusesCount: 260, createdAt: "Sun Jan 01 00:00:00 +0000 2023" }, status: "success" });
  }
  if (url.pathname === "/twitter/user/last_tweets") {
    // Simulate a timeline that only reaches back 140 tweets, so search must back-fill.
    const own = newestFirst.slice(0, 140).filter((t) => !t.isReply || q.get("includeReplies") === "true");
    return send(page(own, q.get("cursor")));
  }
  if (url.pathname === "/twitter/tweet/advanced_search") {
    const query = q.get("query") ?? "";
    const until = Number(query.match(/until_time:(\d+)/)?.[1] ?? Infinity);
    const since = Number(query.match(/since_time:(\d+)/)?.[1] ?? 0);
    let list = newestFirst.filter((t) => ts(t) < until && ts(t) >= since);
    if (/-filter:replies/.test(query)) list = list.filter((t) => !t.isReply);
    if (/to:/.test(query)) list = list.filter((t) => t.isReply && t.inReplyToUserId === SELF.id);
    return send(page(list, q.get("cursor")));
  }
  if (url.pathname === "/chat/completions") {
    const b = JSON.parse(body);
    if (b.stream) return streamChat(b, res);
    return send(chat(b));
  }
  if (url.pathname === "/batchHistorical") return send(prices(JSON.parse(q.get("coins") ?? "{}")));
  res.writeHead(404).end("not found");
});


/** Chat answers for the local site: streamed word by word like a real provider. */
async function streamChat(body: any, res: import("node:http").ServerResponse) {
  const sys: string = body.messages[0]?.content ?? "";
  const q: string = body.messages[body.messages.length - 1]?.content ?? "";
  const callId = sys.split("=== CALLS")[1]?.match(/\[post:(\d+)\]/)?.[1];
  const exId = sys.split("=== EXAMPLES")[1]?.match(/^\[(\d+)\]/m)?.[1];
  const answer = /who are you/i.test(q)
    ? `ii-01 here. an unofficial AI model of @${SELF.handle}, built from public posts — not the real one. ask me what they'd do.`
    : /buy|sell|hold|ape|fade/i.test(q)
      ? `down 20% on no news is a gift. that's the whole rule [post:${callId}]\n\nsize small, add on strength, never marry the bag [post:${exId}]. if it loses the level, i'm out without a speech.\n\nVERDICT: BUY`
      : `never posted about that. markets are a mirror though — most of you are trading your mood [post:${exId}]`;
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const w of answer.match(/\S+\s*/g) ?? []) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
    await new Promise((r) => setTimeout(r, 35));
  }
  res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: Math.ceil(sys.length / 4), completion_tokens: 80, prompt_cache_hit_tokens: Math.ceil(sys.length / 4) } })}\n\n`);
  res.end("data: [DONE]\n\n");
}
