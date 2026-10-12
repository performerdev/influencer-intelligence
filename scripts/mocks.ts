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
  else if (r === 1)
    tweets.push({
      ...base,
      // half are one-word noise, half say something (only those are kept with --replies)
      text: i % 40 === 1 ? "@someone lol no" : `@someone honestly the funding rate tells you everything here, i would wait (${i})`,
      isReply: true,
      inReplyToId: String(5_000_000 + i),
      inReplyToUserId: "777",
      inReplyToUsername: "someone",
    });
  else if (r === 2) tweets.push({ ...base, text: `and the second part of the thread (${i})`, isReply: true, inReplyToId: String(1_000_000 + i - 1), inReplyToUserId: SELF.id });
  else if (r === 3) tweets.push({ ...base, text: `this is exactly the top signal (${i})`, quoted_tweet: { id: "5", text: "new ATH incoming", author: { userName: "loudguy" } } });
  else tweets.push({ ...base, ...lines[i % lines.length](i) });
}
export const newestFirst = [...tweets].sort((a, b) => Number(b.id) - Number(a.id));
const ts = (t: T) => new Date(t.createdAt).getTime() / 1000;

/* ───────────────────────── mock APIs ───────────────────────── */

export const calls: Record<string, number> = {};
const paidRefs = new Set<string>();
// the CLI asks for timelines by user id; remember which added handle that id belongs to
const idToHandle = new Map<string, string>();
// test hooks: posts made "on X" during a test, and the last chat request the model saw
const posted = new Map<string, T[]>();
let lastChat: unknown = null;
/** Any other handle gets its own copy of the account (fresh ids, its own author id) — for "Add a brain" tests. */
const otherId = (h: string) => `88${[...h.toLowerCase()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1_000_000, 7)}`;
const isSelf = (h: string | null | undefined) => !h || h.toLowerCase() === SELF.handle.toLowerCase();
function asHandle(list: T[], h: string | null | undefined): T[] {
  if (isSelf(h)) return list;
  const id = otherId(h!);
  const re = (x: unknown) => (x == null ? x : `${x}77`);
  return list.map((t) => ({
    ...t,
    id: re(t.id),
    author: { id, userName: h },
    inReplyToId: t.inReplyToUserId === SELF.id ? re(t.inReplyToId) : t.inReplyToId,
    inReplyToUserId: t.inReplyToUserId === SELF.id ? id : t.inReplyToUserId,
  }));
}
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
    const who = q.get("userName");
    if (!isSelf(who)) {
      if (/^nobody/i.test(who!)) return send({ status: "error", message: "User not found" });
      idToHandle.set(otherId(who!), who!);
      return send({ data: { id: otherId(who!), userName: who, name: `Mock ${who}`, followers: 4321, statusesCount: 260, createdAt: "Sun Jan 01 00:00:00 +0000 2023", profilePicture: "https://pbs.twimg.com/profile_images/1/mock_normal.png" }, status: "success" });
    }
    return send({ data: { id: SELF.id, userName: SELF.handle, name: "Test Account", followers: 12345, statusesCount: 260, createdAt: "Sun Jan 01 00:00:00 +0000 2023" }, status: "success" });
  }
  if (url.pathname === "/twitter/user/last_tweets") {
    // Simulate a timeline that only reaches back 140 tweets, so search must back-fill.
    const extra = posted.get((q.get("userName") ?? "").toLowerCase()) ?? [];
    if (extra.length) return send(page([...extra], q.get("cursor")));
    const own = asHandle(newestFirst, q.get("userName") ?? idToHandle.get(q.get("userId") ?? "") ?? null).slice(0, 140).filter((t) => !t.isReply || q.get("includeReplies") === "true");
    return send(page(own, q.get("cursor")));
  }
  if (url.pathname === "/twitter/tweet/advanced_search") {
    const query = q.get("query") ?? "";
    const until = Number(query.match(/until_time:(\d+)/)?.[1] ?? Infinity);
    const since = Number(query.match(/since_time:(\d+)/)?.[1] ?? 0);
    const fromH = query.match(/from:(\w+)/)?.[1];
    let list = asHandle(newestFirst, fromH).filter((t) => ts(t) < until && ts(t) >= since);
    if (/-filter:replies/.test(query)) list = list.filter((t) => !t.isReply);
    else if (/(^|\s)filter:replies/.test(query)) list = list.filter((t) => t.isReply);
    if (/to:/.test(query)) list = list.filter((t) => t.isReply && t.inReplyToUserId === (isSelf(fromH) ? SELF.id : otherId(fromH!)));
    return send(page(list, q.get("cursor")));
  }
  /* ── X OAuth 2.0 (login) ── */
  if (url.pathname === "/i/oauth2/authorize") {
    // consent screen auto-approves: back to the app with a code
    const back = new URL(q.get("redirect_uri")!);
    back.searchParams.set("code", `code-${q.get("code_challenge")?.slice(0, 8)}`);
    back.searchParams.set("state", q.get("state") ?? "");
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }
  if (url.pathname === "/2/oauth2/token") return send({ token_type: "bearer", access_token: "mock-access", scope: "tweet.read users.read" });
  if (url.pathname === "/2/users/me") {
    return send({ data: { id: "4242", username: "mock_user", name: "Mock User", profile_image_url: "https://pbs.twimg.com/profile_images/0/mock_normal.png" } });
  }
  /* ── Solana JSON-RPC (Plus payments) ── */
  if (url.pathname === "/solana/pay") {
    // test hook: mark a reference as paid
    paidRefs.add(q.get("ref") ?? "");
    return send({ ok: true });
  }
  if (url.pathname === "/solana") {
    const b = JSON.parse(body || "{}");
    const ok = (result: unknown) => send({ jsonrpc: "2.0", id: b.id, result });
    if (b.method === "getSignaturesForAddress") return ok(paidRefs.has(b.params[0]) ? [{ signature: `sig-${b.params[0].slice(0, 8)}`, err: null }] : []);
    if (b.method === "getTransaction") {
      const owner = process.env.NEXT_PUBLIC_PLUS_RECIPIENT || "H1Gck5JTfM4T67jQ1Q5hgRFBRgqbLGNrVVGDXc8t7bqz";
      const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
      return ok({
        meta: {
          err: null,
          preTokenBalances: [{ accountIndex: 2, mint, owner, uiTokenAmount: { amount: "5000000" } }],
          postTokenBalances: [{ accountIndex: 2, mint, owner, uiTokenAmount: { amount: "15000000" } }],
        },
      });
    }
    if (b.method === "getTokenAccountBalance") return ok({ context: { slot: 1 }, value: { amount: "25000000", decimals: 6, uiAmount: 25, uiAmountString: "25" } });
    if (b.method === "getLatestBlockhash") return ok({ context: { slot: 1 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 10 } });
    return send({ jsonrpc: "2.0", id: b.id, error: { code: -32601, message: "mock: unsupported" } });
  }
  if (url.pathname === "/twitter/tweets") {
    // Parents of replies: synthesized from the id; one is "deleted" to test empty parents.
    const ids = (q.get("tweet_ids") ?? "").split(",").filter(Boolean);
    return send({
      tweets: ids.filter((id) => !id.endsWith("21")).map((id) => ({ type: "tweet", id, text: `what do you make of this pump? (${id})`, createdAt: new Date(start).toUTCString().replace("GMT", "+0000"), author: { id: "777", userName: "someone" } })),
      status: "success",
    });
  }
  if (url.pathname === "/__post") {
    const h = (q.get("handle") ?? "").toLowerCase();
    const t = { type: "tweet", id: String(Date.now()), createdAt: new Date().toUTCString().replace("GMT", "+0000"), text: q.get("text") ?? "", author: { id: "999", userName: h }, entities: { urls: [{ expanded_url: q.get("url") ?? "" }] } };
    posted.set(h, [t, ...(posted.get(h) ?? [])]);
    return send({ ok: true });
  }
  if (url.pathname === "/__last_chat") return send(lastChat ?? {});
  if (url.pathname === "/chat/completions") {
    const b = JSON.parse(body);
    lastChat = b;
    if (b.stream) return streamChat(b, res);
    return send(chat(b));
  }
  /* ── live prices (DefiLlama current + DexScreener) ── */
  if (url.pathname.startsWith("/prices/current/")) {
    const ids = decodeURIComponent(url.pathname.slice("/prices/current/".length)).split(",");
    return send({ coins: Object.fromEntries(ids.map((id) => [id, { price: id.includes("solana") ? 142.5 : id.includes("bitcoin") ? 97000 : 3.21, symbol: "X", timestamp: Math.floor(Date.now() / 1000), confidence: 0.99 }])) });
  }
  if (url.pathname.startsWith("/percentage/")) {
    const ids = decodeURIComponent(url.pathname.slice("/percentage/".length)).split(",");
    return send({ coins: Object.fromEntries(ids.map((id) => [id, 2.4])) });
  }
  if (url.pathname === "/latest/dex/search" || url.pathname.startsWith("/latest/dex/tokens/")) {
    const sym = (q.get("q") ?? "MOCK").toUpperCase();
    return send({ pairs: [{ chainId: "solana", baseToken: { symbol: sym, address: SOL_CA, name: sym }, priceUsd: "0.0123", priceChange: { h24: -5.5 }, liquidity: { usd: 250000 }, marketCap: 12300000 }] });
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
