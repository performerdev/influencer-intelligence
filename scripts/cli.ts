/**
 * Influencer Intelligence pipeline CLI.
 *
 *   pnpm db:migrate
 *   pnpm brain:probe   <handle|code|--all>        cheap test of every API + cost estimate
 *   pnpm brain:ingest  <handle|--all> [--max-usd 15] [--no-threads] [--refresh]
 *   pnpm brain:distill <handle|--all> [--fresh]
 *   pnpm brain:stats   <handle|--all>
 *   pnpm brain:export  [handle|--all]
 *   pnpm brain:build   <handle|--all> [--max-usd 15]   ingest → distill → stats → brain → export
 *   pnpm brain:status
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type BrainFiles,
  OpenAICompatibleLLM,
  assembleBrain,
  distillInfluencer,
  exportBrain,
  latestBrain,
} from "@ii/brain-core";
import { type InfluencerRow, closeDb, db, getInfluencer, migrate, upsertInfluencers } from "@ii/db";
import { type XTweet, classify, createSource, ingestInfluencer } from "@ii/ingest";
import { DefiLlamaPrices, computeStats } from "@ii/stats";

import { intelligences } from "../apps/web/config/intelligences";
import { LLM_PRICES, PARSE_PRICE_PER_1K_POSTS, llmPrice } from "../config/pricing";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.II_SKIP_DOTENV && existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));

const DISTILL_MODEL = process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro";

/* ───────────────────────── args ───────────────────────── */

const [, , command, ...rest] = process.argv;
const flags = new Map<string, string | true>();
const positional: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) {
    const next = rest[i + 1];
    if (next && !next.startsWith("--") && /^--(max-usd)$/.test(a)) {
      flags.set(a.slice(2), next);
      i++;
    } else flags.set(a.slice(2), true);
  } else positional.push(a);
}
const maxUsd = Number(flags.get("max-usd") ?? process.env.INGEST_MAX_USD ?? 15);

/* ───────────────────────── output ───────────────────────── */

const isTTY = process.stdout.isTTY;
const line = (s: string) => (isTTY ? process.stdout.write(`\r\x1b[2K${s}`) : undefined);
const done = (s: string) => (isTTY ? process.stdout.write(`\r\x1b[2K${s}\n`) : console.log(s));
const usd = (x: number) => `$${x.toFixed(x < 1 ? 3 : 2)}`;
const fmt = (n: number) => n.toLocaleString("en-US");

/* ───────────────────────── targets ───────────────────────── */

async function targets(): Promise<InfluencerRow[]> {
  const sql = db();
  await migrate(sql);
  const rows = await upsertInfluencers(sql, intelligences);
  if (flags.has("all")) return rows;
  if (!positional.length) {
    if (command === "export" || command === "status") return rows;
    throw new Error(`Name an influencer (handle or code) or pass --all. Configured: ${intelligences.map((i) => `${i.code} @${i.handle}`).join(", ")}`);
  }
  return Promise.all(
    positional.map(async (p) => {
      const r = await getInfluencer(sql, p);
      if (!r) throw new Error(`@${p.replace(/^@/, "")} is not in apps/web/config/intelligences.ts`);
      return r;
    }),
  );
}

/* ───────────────────────── steps ───────────────────────── */

async function stepIngest(inf: InfluencerRow, opts: { refresh?: boolean } = {}) {
  const res = await ingestInfluencer(db(), createSource(), inf, {
    maxUsd,
    threads: !flags.has("no-threads"),
    refresh: opts.refresh ?? flags.has("refresh"),
    onProgress: (p) =>
      line(`  ${inf.code} @${inf.handle} · ${p.phase} · page ${p.pages} · kept ${fmt(p.kept)} · back to ${p.oldest?.toISOString().slice(0, 10) ?? "—"} · spent ${usd(p.spentUsd)}`),
  });
  const [r] = await db()<{ posts_parsed: number }[]>`select posts_parsed from influencers where id = ${inf.id}`;
  done(
    `  ${inf.code} @${inf.handle} · ingest ${res.status === "done" ? "complete" : `paused at the $${maxUsd} cap (run again to continue, or raise --max-usd)`} · ${fmt(r.posts_parsed)} posts stored · twitterapi spend ${usd(res.spentUsd)}`,
  );
  return res;
}

async function stepDistill(inf: InfluencerRow) {
  const llm = new OpenAICompatibleLLM();
  const files = await distillInfluencer(db(), llm, inf, {
    model: DISTILL_MODEL,
    fresh: flags.has("fresh"),
    onProgress: (p) => line(`  ${inf.code} @${inf.handle} · distill ${p.step} ${p.done}/${p.total} · ${usd(p.costUsd)}`),
  });
  done(`  ${inf.code} @${inf.handle} · distilled · ${files.calls.length} calls · ${files.exampleIds.length} examples · "${files.oneLineMind}"`);
  return files;
}

async function stepStats(inf: InfluencerRow) {
  const calls = await db()<
    { post_id: string; ticker: string; chain: string | null; address: string | null; direction: "buy" | "sell" | "hold"; called_at: Date }[]
  >`select post_id, ticker, chain, address, direction, called_at from calls where influencer_id = ${inf.id} order by called_at`;
  line(`  ${inf.code} @${inf.handle} · pricing ${calls.length} calls…`);
  const stats = await computeStats(calls, new DefiLlamaPrices());
  await db()`
    insert into stats (influencer_id, data, computed_at) values (${inf.id}, ${db().json(stats as never)}, ${stats.computed_at})
    on conflict (influencer_id) do update set data = excluded.data, computed_at = excluded.computed_at`;
  done(`  ${inf.code} @${inf.handle} · stats · ${stats.calls_priced}/${stats.calls_total} calls priced · computed ${stats.computed_at.slice(0, 16)}Z`);
  return stats;
}

async function stepAssemble(inf: InfluencerRow, files: Omit<BrainFiles, "identity">) {
  const llm = new OpenAICompatibleLLM();
  const b = await assembleBrain(db(), llm, inf, { ...files, identity: "" }, DISTILL_MODEL);
  done(`  ${inf.code} @${inf.handle} · brain v${b.version} · ~${fmt(b.promptTokens)} tokens · ${b.examples} examples`);
  return b;
}

async function stepExport(inf: InfluencerRow) {
  const fresh = (await getInfluencer(db(), inf.code))!;
  const dir = await exportBrain(db(), fresh, ROOT);
  done(dir ? `  ${inf.code} @${inf.handle} · exported → ${dir.replace(`${ROOT}/`, "")}` : `  ${inf.code} @${inf.handle} · no brain yet, nothing to export`);
}

/* ───────────────────────── probe ───────────────────────── */

async function probe(list: InfluencerRow[]) {
  const source = createSource();
  console.log(`\nSource: ${source.name}. Each check makes 1–4 small requests (well under $0.01 per account).\n`);
  let totalParse = 0;
  let totalDistill = 0;
  for (const inf of list) {
    try {
      const p = await source.profile(inf.handle);
      const tl = await source.timeline({ userId: p.id, handle: inf.handle });
      const kinds = { post: 0, quote: 0, thread: 0, dropped: 0 };
      for (const t of tl.tweets) {
        const k = classify(t, p.id);
        if (k) kinds[k]++;
        else kinds.dropped++;
      }
      const s1 = await source.search({ query: `from:${inf.handle} -filter:replies` });
      const s1Replies = s1.tweets.filter((t) => t.isReply && t.inReplyToUserId !== p.id).length;
      const s1Own = s1.tweets.filter((t) => classify(t, p.id)).length;
      const s2 = await source.search({ query: `from:${inf.handle} to:${inf.handle}` });
      const selfReplies = s2.tweets.filter((t) => classify(t, p.id) === "thread").length;
      const ageDays = p.createdAt ? (Date.now() - p.createdAt.getTime()) / 86_400_000 : null;

      // Rough size: recent rate over the account's life (×0.6, people post less early on), capped by X's own count.
      const rate = (ts: XTweet[], kept: number) => {
        const d = spanDays(ts);
        return d > 0 ? kept / d : null;
      };
      const span = spanDays(tl.tweets);
      const postRate = rate(s1.tweets, s1Own);
      const threadRate = rate(s2.tweets, selfReplies);
      const cap = p.statusesCount ?? Infinity;
      const estPosts = Math.round(Math.min(cap, postRate && ageDays ? postRate * ageDays * 0.6 : 0));
      const estThreads = Math.round(Math.min(cap - estPosts, threadRate && ageDays ? threadRate * ageDays * 0.6 : 0));
      const parse = ((estPosts + estThreads) / 1000) * PARSE_PRICE_PER_1K_POSTS * 1.05;
      const tokensIn = (estPosts + estThreads) * 60;
      const batches = Math.ceil(tokensIn / 40_000);
      const pr = llmPrice(DISTILL_MODEL);
      const distill = (tokensIn * pr.inputMiss + batches * 5_000 * pr.output + batches * 5_000 * pr.inputMiss + 40_000 * pr.output) / 1e6;
      totalParse += parse;
      totalDistill += distill;

      console.log(`${inf.code} @${p.handle}${p.name ? ` (${p.name})` : ""}`);
      console.log(`  profile        ${fmt(p.followers ?? 0)} followers · ${fmt(p.statusesCount ?? 0)} total posts incl. replies/reposts · joined ${p.createdAt?.toISOString().slice(0, 10) ?? "?"}`);
      console.log(`  timeline page  ${tl.tweets.length} returned → ${kinds.post} posts, ${kinds.quote} quotes, ${kinds.thread} own-thread, ${kinds.dropped} dropped (reposts/replies) · spans ${span.toFixed(1)} days`);
      console.log(`  search         "-filter:replies" → ${s1.tweets.length} returned, ${s1Own} kept, ${s1Replies} replies slipped through ${s1.tweets.length && s1Replies === 0 ? "(operator works)" : s1.tweets.length ? "(operator ignored — replies get filtered by code)" : "(no results)"}`);
      console.log(`  threads        "to:${inf.handle}" → ${s2.tweets.length} returned, ${selfReplies} own-thread continuations ${selfReplies ? "(works)" : "(none found on first page)"}`);
      console.log(`  estimate       ~${fmt(estPosts)} own posts + ~${fmt(estThreads)} thread parts · parse ~${usd(parse)} · distill ~${usd(distill)} (${DISTILL_MODEL}, peak rates)\n`);
    } catch (err) {
      console.log(`${inf.code} @${inf.handle}\n  FAILED: ${(err as Error).message}\n`);
    }
  }
  if (list.length > 1) console.log(`Total estimate: parse ~${usd(totalParse)} + distill ~${usd(totalDistill)} = ~${usd(totalParse + totalDistill)}\n`);

  // One-time checks of the other services.
  try {
    const llm = new OpenAICompatibleLLM();
    const r = await llm.complete([{ role: "user", content: "Reply with the single word: ok" }], { model: DISTILL_MODEL, maxTokens: 10, thinking: "disabled" });
    console.log(`LLM      ${DISTILL_MODEL}: replied "${r.text.trim().slice(0, 20)}" ✓`);
  } catch (err) {
    console.log(`LLM      FAILED: ${(err as Error).message}`);
  }
  try {
    const t = Math.floor(new Date("2024-03-01T00:00:00Z").getTime() / 1000);
    const r = await new DefiLlamaPrices().batch({ "coingecko:solana": [t], "solana:EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": [t] });
    console.log(`Prices   SOL on 2024-03-01: ${r["coingecko:solana"][0]?.price ?? "no data"} · WIF by mint address: ${r["solana:EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"][0]?.price ?? "no data (Solana by address unsupported)"}`);
  } catch (err) {
    console.log(`Prices   FAILED: ${(err as Error).message}`);
  }
  console.log(`Database connected, schema up to date ✓`);
  console.log(`\nKnown model prices: ${Object.keys(LLM_PRICES).join(", ")}`);
}

const spanDays = (ts: XTweet[]) => {
  if (ts.length < 2) return 0;
  const t = ts.map((x) => x.createdAt.getTime());
  return (Math.max(...t) - Math.min(...t)) / 86_400_000;
};

/* ───────────────────────── status ───────────────────────── */

async function status(list: InfluencerRow[]) {
  const sql = db();
  const rows = await sql<{ code: string; handle: string; status: string; posts_parsed: number; calls: number; version: number | null; spent: string | null }[]>`
    select i.code, i.handle, i.status, i.posts_parsed,
      (select count(*)::int from calls c where c.influencer_id = i.id) as calls,
      (select max(version) from brains b where b.influencer_id = i.id) as version,
      (select sum(usd) from spend s where s.influencer_id = i.id) as spent
    from influencers i where i.id in ${sql(list.map((l) => l.id))} order by i.code`;
  console.log("\ncode   handle             status       posts   calls  brain  spent");
  for (const r of rows)
    console.log(
      `${r.code}  ${("@" + r.handle).padEnd(18)} ${r.status.padEnd(11)} ${String(r.posts_parsed).padStart(6)}  ${String(r.calls).padStart(5)}  ${r.version ? `v${r.version}`.padStart(5) : "    —"}  ${usd(Number(r.spent ?? 0))}`,
    );
  const [t] = await sql<{ usd: string | null }[]>`select sum(usd) as usd from spend`;
  console.log(`\nTotal spent so far: ${usd(Number(t.usd ?? 0))}\n`);
}

/* ───────────────────────── main ───────────────────────── */

async function main() {
  switch (command) {
    case "migrate": {
      const applied = await migrate(db());
      console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Schema is up to date.");
      await upsertInfluencers(db(), intelligences);
      console.log(`${intelligences.length} intelligences registered.`);
      break;
    }
    case "probe":
    case "quote":
      await probe(await targets());
      break;
    case "status":
      await status(await targets());
      break;
    case "ingest":
      for (const inf of await targets()) await stepIngest(inf);
      break;
    case "distill":
      for (const inf of await targets()) {
        const files = await stepDistill(inf);
        const prev = await latestBrain(db(), inf.id);
        await stepAssemble(inf, { one_line_mind: files.oneLineMind, mind: files.mind, rules: files.rules, voice: files.voice, intro: files.intro, example_ids: files.exampleIds, calls: files.calls, stats: prev?.files.stats ?? null });
      }
      break;
    case "stats":
      for (const inf of await targets()) {
        const stats = await stepStats(inf);
        const prev = await latestBrain(db(), inf.id);
        if (prev) await stepAssemble(inf, { ...prev.files, stats });
      }
      break;
    case "export":
      for (const inf of await targets()) await stepExport(inf);
      break;
    case "build":
      for (const inf of await targets()) {
        console.log(`\n${inf.code} @${inf.handle}`);
        const ing = await stepIngest(inf);
        if (ing.status !== "done" && !flags.has("partial")) {
          console.log(`  stopped at the budget cap; raise --max-usd (or pass --partial to distill what's stored).`);
          continue;
        }
        const prev = await latestBrain(db(), inf.id);
        if (flags.has("refresh") && prev && ing.kept === 0) {
          // Nothing new posted: only re-price calls, and only keep a new version if numbers moved.
          const stats = await stepStats(inf);
          // jsonb reorders object keys, so compare with sorted keys
          const stable = (v: unknown): string =>
            Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
          const same = (a: unknown, b: unknown) => stable(a) === stable(b);
          if (prev.files.stats && same(prev.files.stats.per_call, stats.per_call) && same(prev.files.stats.horizons, stats.horizons)) {
            done(`  ${inf.code} @${inf.handle} · no new posts, numbers unchanged · brain stays v${prev.version}`);
          } else {
            await stepAssemble(inf, { ...prev.files, stats });
            await stepExport(inf);
          }
          continue;
        }
        const files = await stepDistill(inf);
        const stats = await stepStats(inf);
        await stepAssemble(inf, { one_line_mind: files.oneLineMind, mind: files.mind, rules: files.rules, voice: files.voice, intro: files.intro, example_ids: files.exampleIds, calls: files.calls, stats });
        await stepExport(inf);
      }
      await status(await targets());
      break;
    default:
      console.log(readUsage());
  }
}

function readUsage() {
  return `Usage:
  pnpm db:migrate
  pnpm brain:probe   <handle|code|--all>
  pnpm brain:ingest  <handle|--all> [--max-usd 15] [--no-threads] [--refresh]
  pnpm brain:distill <handle|--all> [--fresh]
  pnpm brain:stats   <handle|--all>
  pnpm brain:export  [handle|--all]
  pnpm brain:build   <handle|--all> [--max-usd 15] [--partial]
  pnpm brain:status`;
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

