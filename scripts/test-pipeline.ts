/**
 * End-to-end pipeline test with no network and no keys:
 * an in-process Postgres (PGlite) + a mock server that speaks the
 * twitterapi.io, OpenAI-compatible and DefiLlama APIs.
 *
 *   pnpm test:pipeline
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";

import { API_PORT, SELF, SOL_CA, api, calls, newestFirst, tweets } from "./mocks";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PG_PORT = 54329;

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
    const searchBefore = calls["/twitter/tweet/advanced_search"] ?? 0;
    await run(["build", "blknoiz06", "--max-usd", "5"], env);
    check("re-run reuses cached map batches", (calls["/chat/completions"] ?? 0) - before <= 2, `${(calls["/chat/completions"] ?? 0) - before} LLM calls on re-run`);
    check("re-run does not re-fetch finished phases", (calls["/twitter/tweet/advanced_search"] ?? 0) === searchBefore);
    check("timeline endpoint not used (reposts would be billed)", (calls["/twitter/user/last_tweets"] ?? 0) <= 2, `${calls["/twitter/user/last_tweets"] ?? 0} calls (probe only)`);

    // Weekly refresh: a new post appears, refresh fetches only it and bumps the brain.
    const fresh = { ...tweets[4], id: "2000000", createdAt: new Date().toUTCString().replace("GMT", "+0000"), text: "bought more $SOL again, same rule (new)" };
    newestFirst.unshift(fresh);
    const r1 = calls["/twitter/tweet/advanced_search"] ?? 0;
    const refreshOut = await run(["build", "blknoiz06", "--refresh", "--max-usd", "5"], env);
    const [{ n: hasNew }] = await sql`select count(*)::int as n from posts where id = '2000000'`;
    check("refresh picks up only new posts", hasNew === 1 && (calls["/twitter/tweet/advanced_search"] ?? 0) - r1 <= 4, `${(calls["/twitter/tweet/advanced_search"] ?? 0) - r1} search calls`);
    const [{ v }] = await sql`select max(version)::int as v from brains`;
    check("refresh with new posts makes a new brain version", v >= 3, `v${v}`);
    const r2 = await run(["build", "blknoiz06", "--refresh", "--max-usd", "5"], env);
    check("refresh with nothing new keeps the brain", /brain stays v/.test(r2), r2.match(/brain stays v\d+/)?.[0] ?? r2.slice(-300));
    void refreshOut;

    // Budget cap stops cleanly and resumes.
    await sql`truncate posts, ingest_state, spend, calls, distill_notes, brains, stats restart identity cascade`;
    await sql`update influencers set x_user_id = null`;
    const capped = await run(["ingest", "blknoiz06", "--max-usd", "0.01"], env);
    check("budget cap pauses ingest", /paused at the \$0.01 cap/.test(capped));
    const [{ n: partial }] = await sql`select count(*)::int as n from posts`;
    await run(["ingest", "blknoiz06", "--max-usd", "5"], env);
    const [{ n: full }] = await sql`select count(*)::int as n from posts`;
    check("ingest resumes after the cap", full === expect.post + expect.quote + expect.thread + 1 /* the refresh post */ && partial < full, `${partial} → ${full}`);

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
