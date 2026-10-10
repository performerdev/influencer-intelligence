/**
 * End-to-end pipeline test with no network and no keys:
 * an in-process Postgres (PGlite) + a mock server that speaks the
 * twitterapi.io, OpenAI-compatible and DefiLlama APIs.
 *
 *   pnpm test:pipeline
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PG_PORT = 54329;
const API_PORT = 4010;
const SELF = { id: "42", handle: "blknoiz06" }; // first configured intelligence, so the CLI picks it up

/* ───────────────────────── fake account ───────────────────────── */

type T = Record<string, any>;
const DAY = 86_400_000;
const start = Date.UTC(2023, 0, 1);
const SOL_CA = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
const lines = [
  (i: number) => ({ text: `bought more $SOL here. down 20% on no news is a gift (${i})` }),
  (i: number) => ({ text: `sold my $WIF into strength, euphoria is the signal (${i})` }),
  (i: number) => ({ text: `still holding $ETH, nothing changed (${i})` }),
  (i: number) => ({ text: `aped this one, small size ${SOL_CA} (${i})` }),
  (i: number) => ({ text: `markets are a mirror. most of you are trading your mood (${i})` }),
  (i: number) => ({ text: `never marry a bag. ever. (${i})` }),
  (i: number) => ({ text: `ct is loud today, nothing to do (${i})` }),
];
const tweets: T[] = [];
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
const newestFirst = [...tweets].sort((a, b) => Number(b.id) - Number(a.id));
const ts = (t: T) => new Date(t.createdAt).getTime() / 1000;

/* ───────────────────────── mock APIs ───────────────────────── */

const calls: Record<string, number> = {};
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

const api = createServer(async (req, res) => {
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
    let list = newestFirst.filter((t) => ts(t) < until);
    if (/-filter:replies/.test(query)) list = list.filter((t) => !t.isReply);
    if (/to:/.test(query)) list = list.filter((t) => t.isReply && t.inReplyToUserId === SELF.id);
    return send(page(list, q.get("cursor")));
  }
  if (url.pathname === "/chat/completions") return send(chat(JSON.parse(body)));
  if (url.pathname === "/batchHistorical") return send(prices(JSON.parse(q.get("coins") ?? "{}")));
  res.writeHead(404).end("not found");
});

/* ───────────────────────── run ───────────────────────── */

const run = (args: string[], env: Record<string, string>) =>
  new Promise<string>((resolve, reject) => {
    const p = spawn(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "scripts/cli.ts"), ...args], { cwd: ROOT, env: { ...process.env, ...env } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`cli ${args.join(" ")} exited ${code}\n${out}`))));
  });

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function main() {
  const pg = await PGlite.create();
  const pgServer = new PGLiteSocketServer({ db: pg, port: PG_PORT, host: "127.0.0.1", maxConnections: 10 });
  await pgServer.start();
  await new Promise<void>((r) => api.listen(API_PORT, "127.0.0.1", r));
  const brainDir = join(ROOT, "brains", "ii-01-blknoiz06");
  rmSync(brainDir, { recursive: true, force: true });

  const env = {
    II_SKIP_DOTENV: "1",
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`,
    DATABASE_SSL: "disable",
    DATABASE_POOL_MAX: "1",
    TWITTERAPI_IO_KEY: "test-key",
    TWITTERAPI_IO_BASE_URL: `http://127.0.0.1:${API_PORT}`,
    TWITTERAPI_IO_MIN_INTERVAL_MS: "0",
    LLM_BASE_URL: `http://127.0.0.1:${API_PORT}`,
    LLM_API_KEY: "test",
    LLM_MODEL_DISTILL: "deepseek-v4-pro",
    PRICE_API_BASE: `http://127.0.0.1:${API_PORT}`,
    DISTILL_BATCH_TOKENS: "1500", // force several map batches
  };

  try {
    const probe = await run(["probe", "blknoiz06"], env);
    check("probe runs every check", /timeline page/.test(probe) && /LLM\s+deepseek-v4-pro: replied "ok"/.test(probe) && /Prices/.test(probe), probe.split("\n").find((l) => l.includes("estimate"))?.trim());

    const build = await run(["build", "blknoiz06", "--max-usd", "5"], env);
    process.stdout.write(build.replace(/^/gm, "    │ "));

    const sql = postgres(env.DATABASE_URL, { max: 1 });
    const [inf] = await sql`select * from influencers where code = 'ii-01'`;
    const kinds = await sql`select kind, count(*)::int as n from posts group by kind order by kind`;
    const expect = { post: tweets.filter((t) => !t.isReply && !t.retweeted_tweet && !t.quoted_tweet).length, quote: tweets.filter((t) => t.quoted_tweet).length, thread: tweets.filter((t) => t.isReply && t.inReplyToUserId === SELF.id).length };
    const got = Object.fromEntries(kinds.map((k: any) => [k.kind, k.n]));
    check("all own posts collected (timeline + search back-fill)", got.post === expect.post, `${got.post}/${expect.post}`);
    check("quotes kept with quoted context", got.quote === expect.quote && (await sql`select count(*)::int as n from posts where kind='quote' and quoted_text is not null`)[0].n === expect.quote, `${got.quote}/${expect.quote}`);
    check("own thread continuations kept", got.thread === expect.thread, `${got.thread}/${expect.thread}`);
    const [{ bad }] = await sql`select count(*)::int as bad from posts where text like 'RT @%' or text like '@someone%'`;
    check("reposts and replies to others dropped", bad === 0);
    check("profile + real counts stored", inf.x_user_id === SELF.id && inf.display_name === "Test Account" && inf.posts_parsed === expect.post + expect.quote + expect.thread, `posts_parsed=${inf.posts_parsed}`);

    const cl = await sql`select * from calls order by called_at`;
    const sourceCalls = tweets.filter((t) => !t.isReply && !t.retweeted_tweet && /bought|sold|still holding|aped/.test(t.text)).length;
    check("every call extracted, hallucinated one dropped", cl.length === sourceCalls && !cl.some((c: any) => c.post_id === "999999999"), `${cl.length}/${sourceCalls}`);
    const wrongQuote = cl.find((c: any) => c.direction === "sell")!;
    check("call quotes are verbatim from the post", !wrongQuote.quote.includes("not in the post"), wrongQuote.quote);
    check("contract address detected by code", cl.some((c: any) => c.address === SOL_CA && c.chain === "solana"));

    const [st] = await sql`select data from stats`;
    check("stats computed and dated", st.data.calls_priced > 0 && !!st.data.computed_at && st.data.horizons["7d"].n > 0, `priced ${st.data.calls_priced}/${st.data.calls_total}`);

    const [brain] = await sql`select * from brains order by version desc limit 1`;
    check("brain prompt assembled in order", /=== IDENTITY ===[\s\S]*=== MIND ===[\s\S]*=== RULES ===[\s\S]*=== VOICE ===[\s\S]*=== EXAMPLES[\s\S]*=== CALLS[\s\S]*=== STATS ===/.test(brain.prompt), `v${brain.version}, ~${brain.prompt_tokens} tokens`);
    check("identity never claims to be the person", brain.prompt.includes("I am not @blknoiz06"));
    check("unknown example id (123) dropped", !brain.files.example_ids.includes("123"));
    check("one-line mind saved", inf.one_line_mind === null ? (await sql`select one_line_mind from influencers where code='ii-01'`)[0].one_line_mind === "Buys fear, sells euphoria, never marries a bag" : true);

    const files = ["mind.md", "rules.md", "voice.md", "identity.md", "calls.json", "stats.json", "examples.json", "brain.json"];
    check("open brain exported", files.every((f) => existsSync(join(brainDir, f))), brainDir.replace(`${ROOT}/`, ""));
    const exported = files.map((f) => readFileSync(join(brainDir, f), "utf8")).join("\n");
    check("no full post texts in the export", !exported.includes("markets are a mirror. most of you are trading your mood"));

    // Re-run: map batches are cached, ingest resumes from state (no re-billing of finished phases).
    const before = calls["/chat/completions"] ?? 0;
    const tlBefore = calls["/twitter/user/last_tweets"] ?? 0;
    await run(["build", "blknoiz06", "--max-usd", "5"], env);
    check("re-run reuses cached map batches", (calls["/chat/completions"] ?? 0) - before <= 2, `${(calls["/chat/completions"] ?? 0) - before} LLM calls on re-run`);
    check("re-run does not re-fetch the finished timeline", (calls["/twitter/user/last_tweets"] ?? 0) === tlBefore);

    // Budget cap stops cleanly and resumes.
    await sql`truncate posts, ingest_state, spend, calls, distill_notes, brains, stats restart identity cascade`;
    await sql`update influencers set x_user_id = null`;
    const capped = await run(["ingest", "blknoiz06", "--max-usd", "0.01"], env);
    check("budget cap pauses ingest", /paused at the \$0.01 cap/.test(capped));
    const [{ n: partial }] = await sql`select count(*)::int as n from posts`;
    await run(["ingest", "blknoiz06", "--max-usd", "5"], env);
    const [{ n: full }] = await sql`select count(*)::int as n from posts`;
    check("ingest resumes after the cap", full === expect.post + expect.quote + expect.thread && partial < full, `${partial} → ${full}`);

    const status = await run(["status"], env);
    check("status reports spend", /Total spent so far/.test(status));
    await sql.end();
  } finally {
    api.close();
    await pgServer.stop();
    await pg.close();
    rmSync(brainDir, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll pipeline checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
