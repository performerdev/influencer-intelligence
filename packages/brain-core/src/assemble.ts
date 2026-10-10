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
// Long-form X posts run to 25k characters; the opening carries the voice, so examples are clipped in the prompt.
const EXAMPLE_MAX_CHARS = Number(process.env.BRAIN_EXAMPLE_MAX_CHARS ?? 700);
const exampleLine = (p: PostRow) => {
  const cps = Array.from(formatPost(p));
  return cps.length > EXAMPLE_MAX_CHARS ? `${cps.slice(0, EXAMPLE_MAX_CHARS).join("").trimEnd()}… (long post, clipped)` : cps.join("");
};

export function identityMd(s: BrainSubject, intro: string): string {
  return `# Identity

- I am ${s.code}, an unofficial AI model of @${s.handle}, built only from their public posts on X (${s.posts} posts, ${s.from} – ${s.to}).
- I am not @${s.handle} and I am not affiliated with them. I think and talk the way their posts do.
- I have no positions, no wallet and no live market data. Nothing I say is financial advice.

## How I introduce myself
${intro.trim() || `I'm ${s.code}, the AI brain of @${s.handle}, built from their public posts. Ask me what they'd do.`}
`;
}

type Detail = 3 | 1 | 0;
export type CallsMode = "full" | { ledger: Detail };

const tickerKey = (t: string) => t.replace(/^\$/, "").toUpperCase();
const pct = (x: number | null | undefined) => (x == null ? "no data" : `${(x * 100).toFixed(1)}%`);
const callLine = (c: Call) => `${day(c.called_at)} · ${c.direction.toUpperCase()} · ${c.ticker}${c.address ? ` (${c.address})` : ""} · "${c.quote.replace(/"/g, "'")}" [post:${c.post_id}]`;

function callsSection(calls: Call[], mode: CallsMode): string {
  if (!calls.length) return "No explicit calls found in the posts.";
  if (mode === "full") return calls.map(callLine).join("\n");
  // Ledger: every ticker ever called, with counts, span and the latest calls.
  // The complete list for a ticker is attached to the question whenever it is mentioned.
  const groups = new Map<string, Call[]>();
  for (const c of calls) {
    const k = tickerKey(c.ticker);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const head = `Ledger of all ${calls.length} calls on ${groups.size} tickers (most-called first). When the user asks about a ticker, its complete call list with quotes is attached to their message — use that for specifics.`;
  const lines = rows.map(([k, cs]) => {
    const n = { buy: 0, sell: 0, hold: 0 };
    for (const c of cs) n[c.direction]++;
    const span = cs.length > 1 ? `${day(cs[0].called_at)} → ${day(cs[cs.length - 1].called_at)}` : day(cs[0].called_at);
    const latest = mode.ledger
      ? ` · latest: ${cs
          .slice(-mode.ledger)
          .reverse()
          .map((c) => `${day(c.called_at)} ${c.direction.toUpperCase()} [post:${c.post_id}]`)
          .join(", ")}`
      : "";
    return `$${k} · ${cs.length} (buy ${n.buy}, sell ${n.sell}, hold ${n.hold}) · ${span}${latest}`;
  });
  return [head, ...lines].join("\n");
}

function statsSection(stats: Stats | null, perCall: boolean): string {
  if (!stats) return "Not computed yet. There are no numbers to quote.";
  const h = stats.horizons;
  const lines = [
    `Computed ${stats.computed_at.slice(0, 10)} by code from ${stats.price_source}. Quote these numbers exactly; do not derive new ones.`,
    `Calls: ${stats.calls_total} (buy ${stats.by_direction.buy}, sell ${stats.by_direction.sell}, hold ${stats.by_direction.hold}); priced: ${stats.calls_priced}.`,
    ...(["1d", "7d", "30d"] as const).map(
      (k) => `After ${k}: n=${h[k].n}, median ${pct(h[k].median_return)}, hit rate ${pct(h[k].hit_rate)}.`,
    ),
    `Median hold (buy → next sell of same ticker): ${stats.median_hold_days == null ? "no data" : `${stats.median_hold_days} days`} over ${stats.hold_pairs} pairs.`,
  ];
  if (perCall) {
    lines.push(
      "",
      "Per call (returns signed in the call's favor):",
      ...stats.per_call
        .filter((p) => p.price_at_call != null)
        .map((p) => `${p.called_at.slice(0, 10)} ${p.direction.toUpperCase()} ${p.ticker}: 1d ${pct(p.r_1d)}, 7d ${pct(p.r_7d)}, 30d ${pct(p.r_30d)} [post:${p.post_id}]`),
    );
  } else {
    lines.push("Per-call returns for a ticker are attached to the user's message when they ask about it.");
  }
  return lines.join("\n");
}

const STOP = new Set(
  "THE AND FOR ARE YOU NOT BUT ALL CAN HIS HER ONE NOW NEW GET WHO HOW WHY WHAT WHEN WILL WITH THIS THAT FROM HAVE HAS WAS WERE ITS OUT BUY SELL HOLD LONG SHORT TOP DIP PUMP DUMP MOON CALL CALLS COIN COINS TOKEN TOKENS THINK WOULD SHOULD COULD ABOUT YOUR THEY THEM THAN THEN JUST LIKE DOES DID ANY BEST NEXT RIGHT TODAY WEEK YEAR MONTH MARKET PRICE".split(" "),
);
const ALIASES: Record<string, string> = { BITCOIN: "BTC", ETHEREUM: "ETH", ETHER: "ETH", SOLANA: "SOL", HYPERLIQUID: "HYPE", DOGECOIN: "DOGE", BINANCE: "BNB" };

/** Tickers from this brain's calls that the message mentions ($sol, SOL, solana). */
export function mentionedTickers(calls: Call[], text: string, max = 6): string[] {
  const known = new Set(calls.map((c) => tickerKey(c.ticker)));
  const found: string[] = [];
  const add = (k: string) => {
    if (known.has(k) && !found.includes(k)) found.push(k);
  };
  for (const m of text.matchAll(/\$([A-Za-z][A-Za-z0-9]{1,14})\b/g)) add(m[1].toUpperCase());
  for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9]{2,14})\b/g)) {
    const w = m[1].toUpperCase();
    if (ALIASES[w]) add(ALIASES[w]);
    else if (!STOP.has(w) && (m[1] === w || w.length >= 4)) add(w); // lowercase only for 4+ letters
  }
  return found.slice(0, max);
}

/** The complete record for the mentioned tickers, attached to a single chat turn. */
export function tickerContext(files: Pick<BrainFiles, "calls" | "stats">, tickers: string[], perTicker = 60): string {
  if (!tickers.length) return "";
  const returns = new Map((files.stats?.per_call ?? []).map((p) => [p.post_id, p]));
  const blocks = tickers.map((k) => {
    const cs = files.calls.filter((c) => tickerKey(c.ticker) === k);
    const shown = cs.slice(-perTicker);
    const lines = shown.map((c) => {
      const r = returns.get(c.post_id);
      return `${callLine(c)}${r && r.price_at_call != null ? ` · 1d ${pct(r.r_1d)}, 7d ${pct(r.r_7d)}, 30d ${pct(r.r_30d)}` : ""}`;
    });
    return `$${k} — ${cs.length} calls${cs.length > shown.length ? ` (latest ${shown.length} shown)` : ""}:\n${lines.join("\n")}`;
  });
  return `=== CALLS ON RECORD FOR THIS QUESTION (complete, from the posts) ===\n${blocks.join("\n\n")}`;
}

/** The exact system prompt for chat. Fixed order: rules, identity, mind, rules, voice, examples, calls, stats. */
export function buildBrainPrompt(s: BrainSubject, f: BrainFiles, examples: PostRow[], calls: CallsMode = "full"): string {
  return [
    chatRules(s),
    `\n=== IDENTITY ===\n${f.identity}`,
    `\n=== MIND ===\n${f.mind}`,
    `\n=== RULES ===\n${f.rules}`,
    `\n=== VOICE ===\n${f.voice}`,
    `\n=== EXAMPLES (their own posts) ===\n${examples.map(exampleLine).join("\n")}`,
    calls === "full" ? `\n=== CALLS (every explicit call, complete) ===\n${callsSection(f.calls, calls)}` : `\n=== CALLS (ledger of every ticker called) ===\n${callsSection(f.calls, calls)}`,
    `\n=== STATS ===\n${statsSection(f.stats, calls === "full")}`,
  ].join("\n");
}

/**
 * Build the prompt within the size budget and store it as the next brain
 * version. Over budget: trim examples (down to 120), then switch calls to a
 * per-ticker ledger (the full list is attached per question in chat), and
 * only then compress mind.md. calls.json always stays complete.
 */
export async function assembleBrain(sql: Sql, llm: LLM | null, inf: InfluencerRow, files: BrainFiles, model: string) {
  const [range] = await sql<{ n: number; from: Date; to: Date }[]>`
    select count(*)::int as n, min(created_at) as from, max(created_at) as to from posts where influencer_id = ${inf.id}`;
  const subject: BrainSubject = { code: inf.code, handle: inf.handle, posts: range.n, from: day(range.from), to: day(range.to) };
  files = { ...files, identity: identityMd(subject, files.intro) };

  const ids = files.example_ids;
  const rows = ids.length
    ? await sql<PostRow[]>`
        select id, kind, text, created_at, quoted_author, quoted_text, reply_to_author, reply_to_text, likes, reposts, views
        from posts where id in ${sql(ids)}`
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  let examples = ids.map((id) => byId.get(id)).filter((r): r is PostRow => !!r);

  let mode: CallsMode = "full";
  let prompt = buildBrainPrompt(subject, files, chrono(examples), mode);
  while (estimateTokens(prompt) > BRAIN_MAX_TOKENS && examples.length > MIN_EXAMPLES) {
    examples = examples.slice(0, Math.max(MIN_EXAMPLES, Math.floor(examples.length * 0.9)));
    prompt = buildBrainPrompt(subject, files, chrono(examples), mode);
  }
  for (const detail of [3, 1, 0] as const) {
    if (estimateTokens(prompt) <= BRAIN_MAX_TOKENS) break;
    mode = { ledger: detail };
    prompt = buildBrainPrompt(subject, files, chrono(examples), mode);
  }
  if (estimateTokens(prompt) > BRAIN_MAX_TOKENS && llm) {
    const over = estimateTokens(prompt) - BRAIN_MAX_TOKENS;
    const mindWords = files.mind.split(/\s+/).length;
    const target = Math.max(600, Math.floor(mindWords - (over * 0.75) / 1.3));
    const res = await compressMarkdown(llm, files.mind, target, model);
    await recordSpend(sql, { influencerId: inf.id, kind: "llm", units: res.usage.input + res.usage.output, usd: res.usage.costUsd, meta: { step: "compress" } });
    files = { ...files, mind: res.text };
    prompt = buildBrainPrompt(subject, files, chrono(examples), mode);
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
