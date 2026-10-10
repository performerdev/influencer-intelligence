import { type InfluencerRow, type Sql, recordSpend } from "@ii/db";
import type { Stats } from "@ii/stats";

import type { Call } from "./calls";
import { compressMarkdown } from "./distill";
import { type PostRow, day, formatPost } from "./format";
import { type LLM, estimateTokens } from "./llm";
import { type BrainSubject, chatRules } from "./prompts";

export type BrainFiles = {
  one_line_mind: string;
  identity: string;
  mind: string;
  rules: string;
  voice: string;
  intro: string;
  example_ids: string[];
  calls: Call[];
  stats: Stats | null;
};

export const BRAIN_MAX_TOKENS = Number(process.env.BRAIN_MAX_TOKENS ?? 50_000);
const MIN_EXAMPLES = 120;

export function identityMd(s: BrainSubject, intro: string): string {
  return `# Identity

- I am ${s.code}, an unofficial AI model of @${s.handle}, built only from their public posts on X (${s.posts} posts, ${s.from} – ${s.to}).
- I am not @${s.handle} and I am not affiliated with them. I think and talk the way their posts do.
- I have no positions, no wallet and no live market data. Nothing I say is financial advice.

## How I introduce myself
${intro.trim() || `I'm ${s.code}, the AI brain of @${s.handle}, built from their public posts. Ask me what they'd do.`}
`;
}

function callsSection(calls: Call[]): string {
  if (!calls.length) return "No explicit calls found in the posts.";
  return calls
    .map((c) => `${day(c.called_at)} · ${c.direction.toUpperCase()} · ${c.ticker}${c.address ? ` (${c.address})` : ""} · "${c.quote.replace(/"/g, "'")}" [post:${c.post_id}]`)
    .join("\n");
}

function statsSection(stats: Stats | null): string {
  if (!stats) return "Not computed yet. There are no numbers to quote.";
  const h = stats.horizons;
  const pct = (x: number | null) => (x == null ? "no data" : `${(x * 100).toFixed(1)}%`);
  const lines = [
    `Computed ${stats.computed_at.slice(0, 10)} by code from ${stats.price_source}. Quote these numbers exactly; do not derive new ones.`,
    `Calls: ${stats.calls_total} (buy ${stats.by_direction.buy}, sell ${stats.by_direction.sell}, hold ${stats.by_direction.hold}); priced: ${stats.calls_priced}.`,
    ...(["1d", "7d", "30d"] as const).map(
      (k) => `After ${k}: n=${h[k].n}, median ${pct(h[k].median_return)}, hit rate ${pct(h[k].hit_rate)}.`,
    ),
    `Median hold (buy → next sell of same ticker): ${stats.median_hold_days == null ? "no data" : `${stats.median_hold_days} days`} over ${stats.hold_pairs} pairs.`,
    "",
    "Per call (returns signed in the call's favor):",
    ...stats.per_call
      .filter((p) => p.price_at_call != null)
      .map((p) => `${p.called_at.slice(0, 10)} ${p.direction.toUpperCase()} ${p.ticker}: 1d ${pct(p.r_1d)}, 7d ${pct(p.r_7d)}, 30d ${pct(p.r_30d)} [post:${p.post_id}]`),
  ];
  return lines.join("\n");
}

/** The exact system prompt for chat. Fixed order: rules, identity, mind, rules, voice, examples, calls, stats. */
export function buildBrainPrompt(s: BrainSubject, f: BrainFiles, examples: PostRow[]): string {
  return [
    chatRules(s),
    `\n=== IDENTITY ===\n${f.identity}`,
    `\n=== MIND ===\n${f.mind}`,
    `\n=== RULES ===\n${f.rules}`,
    `\n=== VOICE ===\n${f.voice}`,
    `\n=== EXAMPLES (their own posts) ===\n${examples.map(formatPost).join("\n")}`,
    `\n=== CALLS (every explicit call, complete) ===\n${callsSection(f.calls)}`,
    `\n=== STATS ===\n${statsSection(f.stats)}`,
  ].join("\n");
}

/**
 * Build the prompt within the size budget and store it as the next brain
 * version. Over budget: trim examples first (down to 120), then compress
 * mind.md. Calls are never trimmed.
 */
export async function assembleBrain(sql: Sql, llm: LLM | null, inf: InfluencerRow, files: BrainFiles, model: string) {
  const [range] = await sql<{ n: number; from: Date; to: Date }[]>`
    select count(*)::int as n, min(created_at) as from, max(created_at) as to from posts where influencer_id = ${inf.id}`;
  const subject: BrainSubject = { code: inf.code, handle: inf.handle, posts: range.n, from: day(range.from), to: day(range.to) };
  files = { ...files, identity: identityMd(subject, files.intro) };

  const ids = files.example_ids;
  const rows = ids.length
    ? await sql<PostRow[]>`
        select id, kind, text, created_at, quoted_author, quoted_text, likes, reposts, views
        from posts where id in ${sql(ids)}`
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  let examples = ids.map((id) => byId.get(id)).filter((r): r is PostRow => !!r);

  let prompt = buildBrainPrompt(subject, files, chrono(examples));
  while (estimateTokens(prompt) > BRAIN_MAX_TOKENS && examples.length > MIN_EXAMPLES) {
    examples = examples.slice(0, Math.max(MIN_EXAMPLES, Math.floor(examples.length * 0.9)));
    prompt = buildBrainPrompt(subject, files, chrono(examples));
  }
  if (estimateTokens(prompt) > BRAIN_MAX_TOKENS && llm) {
    const over = estimateTokens(prompt) - BRAIN_MAX_TOKENS;
    const mindWords = files.mind.split(/\s+/).length;
    const target = Math.max(600, Math.floor(mindWords - (over * 0.75) / 1.3));
    const res = await compressMarkdown(llm, files.mind, target, model);
    await recordSpend(sql, { influencerId: inf.id, kind: "llm", units: res.usage.input + res.usage.output, usd: res.usage.costUsd, meta: { step: "compress" } });
    files = { ...files, mind: res.text };
    prompt = buildBrainPrompt(subject, files, chrono(examples));
  }
  files = { ...files, example_ids: examples.map((e) => e.id) };

  const [{ v }] = await sql<{ v: number }[]>`select coalesce(max(version), 0) + 1 as v from brains where influencer_id = ${inf.id}`;
  await sql`
    insert into brains (influencer_id, version, files, prompt, prompt_tokens, model, posts_from, posts_to)
    values (${inf.id}, ${v}, ${sql.json(files as never)}, ${prompt}, ${estimateTokens(prompt)}, ${model}, ${range.from}, ${range.to})`;
  await sql`update influencers set status = 'ready', one_line_mind = ${files.one_line_mind || null} where id = ${inf.id}`;
  return { version: v, promptTokens: estimateTokens(prompt), examples: examples.length, files, subject };
}

export async function latestBrain(sql: Sql, influencerId: number) {
  const [row] = await sql<{ version: number; files: BrainFiles; prompt: string; prompt_tokens: number; model: string; created_at: Date }[]>`
    select version, files, prompt, prompt_tokens, model, created_at from brains
    where influencer_id = ${influencerId} order by version desc limit 1`;
  return row ?? null;
}

const chrono = (xs: PostRow[]) => [...xs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
