import "server-only";

import { OpenAICompatibleLLM, parseJsonReply, tickerContext } from "@ii/brain-core";
import { recordSpend } from "@ii/db";

import { type RecordRow, day, recordRows, signed, summary, tickerKey } from "@/lib/record";

import { type LoadedBrain, type Reference, sql } from "./data";
import { noteSpend } from "./ops";
import { type TokenInfo, priceText, tokenLines } from "./token";

/**
 * "Check a coin" and "Rate my bag": the mind looks at real, live coins and
 * judges them the way it picks coins — its rules, its record, its taste —
 * in one model call each. Everything it says is checked against its brain
 * before it is shown: posts must be its own, similar coins must be coins it
 * called, rule quotes must be in its rules. Numbers come from code.
 */

export type Verdict = "BUY" | "HOLD" | "SELL" | "PASS";
export type CoinRecord = { n: number; first: string | null; last: { dir: string; at: string; price: number | null; quote: string } | null; n7: number; w7: number | null; m7: number | null };
export type Similar = { ticker: string; n: number; w7: number | null };
export type PlanLine = { label: string; text: string; rule: string | null };
export type CheckResult = { verdict: Verdict; fit: number; take: string; why: { point: string; ref: number | null }[]; plan: PlanLine[]; similar: Similar[]; refs: Reference[] };
export type BagRow = { ticker: string; share: number; action: "Add" | "Keep" | "Trim" | "Cut"; why: string; ref: number | null };
export type BagResult = { score: number; summary: string; rows: BagRow[]; changes: PlanLine[]; refs: Reference[] };

const MODEL = () => process.env.LLM_MODEL_CHAT ?? process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro";
const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");

/* ───────────────────────── the mind's record on a coin ───────────────────────── */

function rowsFor(brain: LoadedBrain): RecordRow[] {
  return recordRows(brain.files.calls as never, (brain.files.stats?.per_call ?? []) as never);
}

function recordOn(rows: RecordRow[], symbol: string, address: string | null, calls: LoadedBrain["files"]["calls"]): CoinRecord {
  const T = tickerKey(symbol);
  const byAddress = address ? new Set(calls.filter((c) => c.address && c.address.toLowerCase() === address.toLowerCase()).map((c) => c.post_id)) : new Set<string>();
  const rs = rows.filter((r) => r.ticker === T || byAddress.has(r.post));
  const s = summary(rs);
  const last = rs[rs.length - 1];
  return {
    n: rs.length,
    first: rs[0] ? day(rs[0].t) : null,
    last: last ? { dir: last.dir, at: day(last.t), price: last.price, quote: last.quote } : null,
    n7: s.n7,
    w7: s.w7,
    m7: s.m7,
  };
}

function recordLine(symbol: string, r: CoinRecord): string {
  if (!r.n) return `You never called $${symbol}.`;
  const last = r.last!;
  return [
    `${r.n} calls on $${symbol}, first ${r.first}, last ${last.dir.toUpperCase()} ${last.at}${last.price ? ` at ${priceText(last.price)}` : ""}: "${last.quote.slice(0, 160)}"`,
    r.n7 ? `worked within 7 days ${Math.round((r.w7 ?? 0) * 100)}% of ${r.n7} priced calls (median ${signed(r.m7)})` : "none of them priced",
  ].join(" · ");
}

/* ───────────────────────── checks on what the model wrote ───────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$%]+/g, " ").trim();
/** A quote counts only when it is really in the mind's rules. */
function ruleQuote(rules: string, q: unknown): string | null {
  const t = String(q ?? "").trim().replace(/^["“]|["”]$/g, "");
  if (t.length < 8) return null;
  return norm(rules).includes(norm(t)) ? t.slice(0, 200) : null;
}
const clean = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const VERDICTS: Verdict[] = ["BUY", "HOLD", "SELL", "PASS"];

/**
 * Post ids the model cited → numbered references. Only posts this brain
 * really cites survive: a call, an example, or a (post:…) in its mind or rules.
 */
async function refsFor(brain: LoadedBrain, ids: (string | null | undefined)[]): Promise<{ refs: Reference[]; n: (id: string | null | undefined) => number | null }> {
  const known = (id: string) => brain.prompt.includes(`post:${id}`) || brain.files.calls.some((c) => c.post_id === id) || brain.files.example_ids.includes(id);
  const wanted = [...new Set(ids.map((x) => String(x ?? "").replace(/\D/g, "")).filter((x) => x.length >= 6 && known(x)))];
  if (!wanted.length) return { refs: [], n: () => null };
  const rows = await sql()<{ id: string; text: string; created_at: Date; quoted_author: string | null; quoted_text: string | null }[]>`
    select id, text, created_at, quoted_author, quoted_text from posts where id in ${sql()(wanted)}`.catch(() => []);
  const byPost = new Map(rows.map((r) => [r.id, r]));
  const refs: Reference[] = wanted.map((id, i) => {
    const p = byPost.get(id);
    const call = brain.files.calls.find((c) => c.post_id === id) ?? null;
    return {
      n: i + 1,
      postId: id,
      kind: call ? "call" : "post",
      date: p ? new Date(p.created_at).toISOString().slice(0, 10) : call ? String(call.called_at).slice(0, 10) : null,
      text: p?.text ?? null,
      quoted: p?.quoted_text ? { author: p.quoted_author, text: p.quoted_text } : null,
      call: call ? { ticker: call.ticker, direction: call.direction, quote: call.quote } : null,
      url: `https://x.com/${brain.handle}/status/${id}`,
    };
  });
  const byId = new Map(refs.map((r) => [r.postId, r.n]));
  return { refs, n: (id) => byId.get(String(id ?? "").replace(/\D/g, "")) ?? null };
}

async function ask(brain: LoadedBrain, turn: string, maxTokens: number) {
  const llm = new OpenAICompatibleLLM();
  const model = MODEL();
  // the brain prompt first and unchanged, so the provider's prompt cache applies like in chat
  const r = await llm.complete(
    [
      { role: "system", content: brain.prompt },
      { role: "user", content: turn },
    ],
    { model, temperature: 0.5, maxTokens, json: true, thinking: "disabled" },
  );
  noteSpend(r.usage.costUsd);
  await recordSpend(sql(), { influencerId: brain.influencerId, kind: "llm", units: r.usage.input + r.usage.output, usd: r.usage.costUsd, meta: { step: "tool", model, ...r.usage } }).catch(() => {});
  return { text: r.text, cost: r.usage.costUsd };
}

/* ───────────────────────── Check a coin ───────────────────────── */

export async function checkCoin(brain: LoadedBrain, token: TokenInfo): Promise<{ record: CoinRecord; result: CheckResult; cost: number }> {
  const rows = rowsFor(brain);
  const record = recordOn(rows, token.symbol, token.address, brain.files.calls);
  const called = new Set(rows.map((r) => r.ticker));
  const context = called.has(token.symbol) ? tickerContext(brain.files, [token.symbol], 25) : "";
  const turn = `=== CHECK A COIN — live data fetched ${now()} UTC, not from your posts ===
${tokenLines(token)}

=== YOUR RECORD ON $${token.symbol} ===
${recordLine(token.symbol, record)}
${context}

Someone pasted this coin and asks: would you buy it? Judge it the way you actually pick coins: your rules, your record, the kind of coins and setups you go for. Use only the data above and your brain. If you never called it, say so and judge it by how it compares with what you do buy.

Reply with JSON only:
{"verdict":"BUY|HOLD|SELL|PASS","fit":0,"take":"","why":[{"point":"","post":null}],"plan":{"size":"","entry":"","take_profit":"","out":""},"rules":{"size":"","entry":"","take_profit":"","out":""},"similar":[]}
- verdict: BUY = you'd buy it now; HOLD = keep it if you already have it; SELL = get out; PASS = you wouldn't touch it.
- fit: 0-10, how well it matches the coins and setups you go for (10 = exactly your kind of trade).
- take: 2-4 sentences in your own voice, first person, answering straight away, no disclaimers.
- why: 2-3 short points in your voice. "post": the number from a post:… citation in your MIND, RULES or CALLS that backs the point. Cite one for every point you can; null only when nothing in your brain backs it.
- plan: always fill all four from YOUR RULES, even when you'd pass: it's how you'd play it if someone insists. One short line each; "" only when your rules say nothing about it.
- rules: for each plan line, a short quote copied word for word from your RULES that it comes from, or "".
- similar: 1-3 tickers from your CALLS ledger closest to this coin (the same kind of coin, chain, size or setup). Only tickers you really called; [] only if you never called anything like it.
Never write a number that isn't in the data above or in your brain.`;

  const { text, cost } = await ask(brain, turn, 900);
  const j = parseJsonReply<any>(text);
  const why = (Array.isArray(j?.why) ? j.why : []).slice(0, 3).map((w: any) => ({ point: clean(w?.point, 280), post: w?.post })).filter((w: any) => w.point);
  const { refs, n } = await refsFor(brain, why.map((w: any) => w.post));
  const labels: [string, string][] = [
    ["size", "Size"],
    ["entry", "Entry"],
    ["take_profit", "Take profit"],
    ["out", "Out"],
  ];
  const plan = labels.map(([k, label]) => ({ label, text: clean(j?.plan?.[k], 220), rule: ruleQuote(brain.files.rules, j?.rules?.[k]) })).filter((p) => p.text);
  const asked: string[] = (Array.isArray(j?.similar) ? j.similar : []).map((t: unknown) => tickerKey(String(t ?? "")));
  const similar = [...new Set(asked)]
    .filter((t) => !!t && t !== token.symbol && called.has(t))
    .slice(0, 3)
    .map((t) => {
      const s = summary(rows.filter((r) => r.ticker === t));
      return { ticker: t, n: rows.filter((r) => r.ticker === t).length, w7: s.n7 ? s.w7 : null };
    });
  const verdict = VERDICTS.includes(String(j?.verdict).toUpperCase() as Verdict) ? (String(j.verdict).toUpperCase() as Verdict) : "PASS";
  return {
    record,
    cost,
    result: {
      verdict,
      fit: Math.max(0, Math.min(10, Math.round(Number(j?.fit) || 0))),
      take: clean(j?.take, 900),
      why: why.map((w: any) => ({ point: w.point, ref: n(w.post) })),
      plan,
      similar,
      refs,
    },
  };
}

/* ───────────────────────── Rate my bag ───────────────────────── */

export type Holding = { q: string; share: number; token: TokenInfo | null };

export async function rateBag(brain: LoadedBrain, holdings: Holding[]): Promise<{ records: Record<string, CoinRecord>; result: BagResult; cost: number }> {
  const rows = rowsFor(brain);
  const records: Record<string, CoinRecord> = {};
  const blocks = holdings.map((h) => {
    const sym = h.token?.symbol ?? tickerKey(h.q).slice(0, 15);
    const rec = recordOn(rows, sym, h.token?.address ?? null, brain.files.calls);
    records[sym] = rec;
    return `--- $${sym} · ${Math.round(h.share * 100)}% of the bag ---\n${h.token ? tokenLines(h.token) : "no live data found for it"}\nYOUR RECORD: ${recordLine(sym, rec)}`;
  });
  const syms = Object.keys(records);
  const turn = `=== RATE MY BAG — live data fetched ${now()} UTC, not from your posts ===
${blocks.join("\n\n")}

Someone shows you their bag (shares of their crypto money) and asks what you'd do. Judge it the way you manage your own: your sizing and risk rules, your record on each coin, your taste. Use only the data above and your brain.

Reply with JSON only:
{"score":0,"summary":"","rows":[{"ticker":"","action":"Add|Keep|Trim|Cut","why":"","post":null}],"changes":[{"label":"","text":"","rule":""}]}
- score: 0-10, how much you'd like holding this bag yourself.
- summary: 2-4 sentences in your own voice, first person, straight away, no disclaimers.
- rows: one per coin above (tickers exactly: ${syms.join(", ")}), action Add / Keep / Trim / Cut, "why" one short line in your voice, "post": the number from a post:… citation in your MIND, RULES or CALLS that backs it (cite whenever you can), or null.
- changes: 1-3 concrete changes with target shares (e.g. "SOL 40% → 60%"), "label" one or two words, "rule" a short quote copied word for word from your RULES that it follows, or "".
Never write a number that isn't in the data above, the shares, or your brain.`;

  const { text, cost } = await ask(brain, turn, 1000);
  const j = parseJsonReply<any>(text);
  const raw = (Array.isArray(j?.rows) ? j.rows : []).filter((r: any) => syms.includes(tickerKey(String(r?.ticker ?? ""))));
  const { refs, n } = await refsFor(brain, raw.map((r: any) => r?.post));
  const ACTIONS = ["Add", "Keep", "Trim", "Cut"] as const;
  const shareOf = new Map(holdings.map((h) => [h.token?.symbol ?? tickerKey(h.q).slice(0, 15), h.share]));
  const result: BagResult = {
    score: Math.max(0, Math.min(10, Math.round(Number(j?.score) || 0))),
    summary: clean(j?.summary, 900),
    rows: syms.map((s) => {
      const r = raw.find((x: any) => tickerKey(String(x.ticker)) === s);
      const a = ACTIONS.find((x) => x.toLowerCase() === String(r?.action ?? "").toLowerCase()) ?? "Keep";
      return { ticker: s, share: shareOf.get(s) ?? 0, action: a, why: clean(r?.why, 200), ref: r ? n(r.post) : null };
    }),
    changes: (Array.isArray(j?.changes) ? j.changes : [])
      .slice(0, 3)
      .map((c: any) => ({ label: clean(c?.label, 24), text: clean(c?.text, 240), rule: ruleQuote(brain.files.rules, c?.rule) }))
      .filter((c: PlanLine) => c.text),
    refs,
  };
  return { records, result, cost };
}
