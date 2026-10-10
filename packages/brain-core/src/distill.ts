import { type InfluencerRow, type Sql, recordSpend } from "@ii/db";

import { type Call, type RawCall, validateCalls } from "./calls";
import { type PostRow, day, formatPost } from "./format";
import { type CompleteOptions, type LLM, estimateTokens, parseJsonReply, parseTagged } from "./llm";
import { compressSystem, mapSystem, mapUser, mergeSystem, reduceSystem } from "./prompts";

export type BatchNotes = {
  period?: string;
  calls?: RawCall[];
  examples?: { post_id: string; topic?: string; mood?: string }[];
  [k: string]: unknown;
};

export type DistilledFiles = {
  oneLineMind: string;
  mind: string;
  rules: string;
  voice: string;
  intro: string;
  exampleIds: string[];
  calls: Call[];
};

export type DistillProgress = { step: "map" | "merge" | "reduce"; done: number; total: number; costUsd: number };

export type DistillOptions = {
  model?: string;
  /** posts per map batch, by estimated tokens */
  batchTokens?: number;
  concurrency?: number;
  /** ignore cached batch notes */
  fresh?: boolean;
  exampleTarget?: number;
  onProgress?: (p: DistillProgress) => void;
};

const MERGE_THRESHOLD_TOKENS = 220_000;

export async function loadPosts(sql: Sql, influencerId: number): Promise<PostRow[]> {
  return sql<PostRow[]>`
    select id, kind, text, created_at, quoted_author, quoted_text, likes, reposts, views
    from posts where influencer_id = ${influencerId} order by created_at, id`;
}

/** Chronological batches sized by estimated tokens. */
export function makeBatches(posts: PostRow[], batchTokens: number) {
  const batches: { posts: PostRow[]; lines: string; key: string }[] = [];
  let cur: PostRow[] = [];
  let lines: string[] = [];
  let tokens = 0;
  const flush = () => {
    if (!cur.length) return;
    batches.push({ posts: cur, lines: lines.join("\n"), key: `${cur[0].id}..${cur[cur.length - 1].id}:${cur.length}` });
    cur = [];
    lines = [];
    tokens = 0;
  };
  for (const p of posts) {
    const line = formatPost(p);
    const t = estimateTokens(line) + 1;
    if (tokens + t > batchTokens) flush();
    cur.push(p);
    lines.push(line);
    tokens += t;
  }
  flush();
  return batches;
}

/**
 * Map → (merge) → reduce. Batch notes are cached in `distill_notes`, so
 * re-running only pays for batches that changed (new posts) plus the reduce.
 */
export async function distillInfluencer(sql: Sql, llm: LLM, inf: InfluencerRow, opts: DistillOptions = {}): Promise<DistilledFiles> {
  const model = opts.model ?? process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro";
  // Reading thousands of posts is bulk extraction: a cheaper model does it well.
  // The final reduce (the personality itself) stays on the stronger model.
  const mapModel = process.env.LLM_MODEL_MAP || model;
  const posts = await loadPosts(sql, inf.id);
  if (posts.length === 0) throw new Error(`@${inf.handle}: no posts in the database yet — run ingest first.`);
  await sql`update influencers set status = 'distilling' where id = ${inf.id}`;

  const byId = new Map(posts.map((p) => [p.id, p]));
  const batches = makeBatches(posts, opts.batchTokens ?? Number(process.env.DISTILL_BATCH_TOKENS ?? 40_000));
  let cost = 0;
  const spend = async (usage: { input: number; output: number; costUsd: number }, step: string, usedModel = model) => {
    cost += usage.costUsd;
    await recordSpend(sql, { influencerId: inf.id, kind: "llm", units: usage.input + usage.output, usd: usage.costUsd, meta: { step, model: usedModel, ...usage } });
  };

  // ── map ──
  const cached = new Map<string, BatchNotes>();
  if (!opts.fresh) {
    for (const r of await sql<{ batch_key: string; notes: BatchNotes }[]>`
      select batch_key, notes from distill_notes where influencer_id = ${inf.id}`) cached.set(r.batch_key, r.notes);
  }
  const notes: BatchNotes[] = new Array(batches.length);
  let done = 0;
  const report = (step: DistillProgress["step"], total: number) => opts.onProgress?.({ step, done, total, costUsd: cost });

  const runBatch = async (i: number) => {
    const b = batches[i];
    const hit = cached.get(b.key);
    if (hit) {
      notes[i] = hit;
    } else {
      let parsed: BatchNotes | null = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const res = await llm.complete(
          [
            { role: "system", content: mapSystem({ handle: inf.handle }) },
            {
              role: "user",
              content: mapUser({
                handle: inf.handle,
                index: i,
                total: batches.length,
                from: day(b.posts[0].created_at),
                to: day(b.posts[b.posts.length - 1].created_at),
                lines: b.lines,
              }),
            },
          ],
          { model: mapModel, json: true, temperature: 0.2, maxTokens: 8000, thinking: (process.env.DISTILL_MAP_THINKING ?? "disabled") as CompleteOptions["thinking"] },
        );
        await spend(res.usage, "map", mapModel);
        try {
          parsed = parseJsonReply<BatchNotes>(res.text);
        } catch {
          parsed = null;
        }
      }
      if (!parsed) {
        // Not cached, so the next run retries this batch.
        notes[i] = { period: `${day(b.posts[0].created_at)}..`, parse_error: true };
        done++;
        report("map", batches.length);
        return;
      }
      notes[i] = parsed;
      await sql`
        insert into distill_notes (influencer_id, batch_key, batch_index, notes, model)
        values (${inf.id}, ${b.key}, ${i}, ${sql.json(parsed as never)}, ${mapModel})
        on conflict (influencer_id, batch_key) do update set notes = excluded.notes, model = excluded.model, batch_index = excluded.batch_index`;
    }
    done++;
    report("map", batches.length);
  };
  await pool(batches.map((_, i) => i), opts.concurrency ?? Number(process.env.DISTILL_CONCURRENCY ?? 4), runBatch);

  // ── calls: straight from the map step, validated by code, kept complete ──
  const calls = validateCalls(notes.flatMap((n) => n.calls ?? []), byId);

  // Example candidates (only real post IDs).
  const candidates = notes.flatMap((n) => (n.examples ?? []).filter((e) => byId.has(String(e.post_id))));

  // ── merge (only when the notes are too large for one reduce) ──
  let reduceNotes: unknown[] = notes.map(({ calls: _c, ...rest }) => rest);
  done = 0;
  while (estimateTokens(JSON.stringify(reduceNotes)) > MERGE_THRESHOLD_TOKENS) {
    const groups = chunkByTokens(reduceNotes, MERGE_THRESHOLD_TOKENS / 2);
    const merged: unknown[] = [];
    for (const g of groups) {
      const res = await llm.complete(
        [
          { role: "system", content: mergeSystem({ handle: inf.handle }) },
          { role: "user", content: JSON.stringify(g) },
        ],
        { model, json: true, temperature: 0.2, maxTokens: 16000, thinking: "disabled" },
      );
      await spend(res.usage, "merge");
      try {
        merged.push(parseJsonReply(res.text));
      } catch {
        merged.push(...g);
      }
      done++;
      report("merge", groups.length);
    }
    if (merged.length >= reduceNotes.length) break; // no progress — reduce what we have
    reduceNotes = merged;
  }

  // ── reduce ──
  const exampleTarget = opts.exampleTarget ?? 260;
  const subject = {
    code: inf.code,
    handle: inf.handle,
    posts: posts.length,
    from: day(posts[0].created_at),
    to: day(posts[posts.length - 1].created_at),
    exampleTarget,
  };
  report("reduce", 1);
  const res = await llm.complete(
    [
      { role: "system", content: reduceSystem(subject) },
      {
        role: "user",
        content: `Notes from ${notes.length} batches, oldest first:\n\n${JSON.stringify(reduceNotes)}\n\nExample candidates (post_id · topic · mood):\n${candidates
          .map((c) => `${c.post_id} · ${c.topic ?? ""} · ${c.mood ?? ""}`)
          .join("\n")}`,
      },
    ],
    { model, temperature: 0.4, maxTokens: 64000, thinking: (process.env.DISTILL_REDUCE_THINKING ?? "high") as CompleteOptions["thinking"] },
  );
  await spend(res.usage, "reduce");
  const t = parseTagged(res.text, ["one_line_mind", "mind", "rules", "voice", "intro", "examples"]);
  for (const k of ["mind", "rules", "voice"]) if (!t[k]) throw new Error(`reduce step returned no <${k}> section — re-run distill`);

  // Examples: model's pick ∩ real posts, topped up with the most-engaged candidates.
  const picked = (t.examples ?? "").split(/[\s,]+/).filter((id) => byId.has(id));
  const exampleIds = [...new Set(picked)];
  if (exampleIds.length < exampleTarget) {
    const extra = [...new Set(candidates.map((c) => String(c.post_id)))]
      .filter((id) => !exampleIds.includes(id))
      .sort((a, b) => (byId.get(b)!.likes ?? 0) - (byId.get(a)!.likes ?? 0));
    exampleIds.push(...extra.slice(0, exampleTarget - exampleIds.length));
  }

  const oneLineMind = (t.one_line_mind ?? "").replace(/^["“]|["”]$/g, "").trim().slice(0, 120);
  await sql`update influencers set one_line_mind = ${oneLineMind || null} where id = ${inf.id}`;

  // Calls table always mirrors the latest distill.
  await sql.begin(async (tx) => {
    await tx`delete from calls where influencer_id = ${inf.id}`;
    if (calls.length) {
      await tx`insert into calls ${tx(
        calls.map((c) => ({
          influencer_id: inf.id,
          post_id: c.post_id,
          ticker: c.ticker,
          chain: c.chain,
          address: c.address,
          direction: c.direction,
          called_at: c.called_at,
          quote: c.quote,
        })),
      )} on conflict do nothing`;
    }
  });

  report("reduce", 1);
  return {
    oneLineMind,
    mind: t.mind,
    rules: t.rules,
    voice: t.voice,
    intro: t.intro ?? "",
    exampleIds: exampleIds.slice(0, Math.max(exampleTarget, 300)),
    calls,
  };
}

/** Shorten mind.md when the assembled brain is over budget. */
export async function compressMarkdown(llm: LLM, md: string, targetWords: number, model?: string) {
  const res = await llm.complete(
    [
      { role: "system", content: compressSystem },
      { role: "user", content: `Target length: about ${targetWords} words.\n\n${md}` },
    ],
    { model, temperature: 0.2, maxTokens: 16000, thinking: "disabled" },
  );
  return { text: res.text.trim(), usage: res.usage };
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

function chunkByTokens<T>(items: T[], max: number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let tok = 0;
  for (const it of items) {
    const t = estimateTokens(JSON.stringify(it));
    if (cur.length && tok + t > max) {
      out.push(cur);
      cur = [];
      tok = 0;
    }
    cur.push(it);
    tok += t;
  }
  if (cur.length) out.push(cur);
  return out;
}
