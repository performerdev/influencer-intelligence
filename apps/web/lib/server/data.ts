import "server-only";

import type { BrainFiles } from "@ii/brain-core";
import { type Sql, db } from "@ii/db";

import { intelligences as config } from "@/config/intelligences";
import type { Intelligence } from "@/lib/intelligences";

/** Serverless functions use the transaction pooler when it's configured. */
export function sql(): Sql {
  return db(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
}

export const hasDatabase = () => Boolean(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);

/* ───────────────────────── intelligences ───────────────────────── */

type InfluencerRow = {
  id: number;
  code: string;
  handle: string;
  display_name: string | null;
  posts_parsed: number;
  posts_per_day: number | null;
  one_line_mind: string | null;
  status: string;
  version: number | null;
  distilled_at: Date | null;
};

/** Config order, real numbers from the database where they exist (never invented). */
export async function loadIntelligences(): Promise<Intelligence[]> {
  const base = config.map((c) => ({ ...c, oneLineMind: null, postsParsed: null, postsPerDay: null, distilledAt: null }));
  if (!hasDatabase()) return base;
  try {
    const rows = await sql()<InfluencerRow[]>`
      select i.id, i.code, i.handle, i.display_name, i.posts_parsed, i.posts_per_day, i.one_line_mind, i.status,
        b.version, b.created_at as distilled_at
      from influencers i
      left join lateral (select version, created_at from brains where influencer_id = i.id order by version desc limit 1) b on true`;
    const byCode = new Map(rows.map((r) => [r.code, r]));
    return base.map((c) => {
      const r = byCode.get(c.code);
      if (!r) return c;
      return {
        ...c,
        displayName: r.display_name ?? c.displayName,
        oneLineMind: r.one_line_mind,
        postsParsed: r.posts_parsed > 0 ? r.posts_parsed : null,
        postsPerDay: r.posts_per_day,
        distilledAt: r.distilled_at ? new Date(r.distilled_at).toISOString() : null,
      };
    });
  } catch (err) {
    console.error("loadIntelligences:", err);
    return base;
  }
}

/* ───────────────────────── brains ───────────────────────── */

export type LoadedBrain = {
  influencerId: number;
  code: string;
  handle: string;
  version: number;
  prompt: string;
  promptTokens: number;
  model: string;
  createdAt: string;
  files: BrainFiles;
};

const cache = new Map<string, { at: number; brain: LoadedBrain }>();
const TTL_MS = 5 * 60_000;

/**
 * The brain the model sees. Cached per instance (a brain is ~150 KB and is the
 * same for every message), so database egress stays small.
 */
export async function loadBrain(handle: string, version?: number): Promise<LoadedBrain | null> {
  const key = `${handle.toLowerCase()}@${version ?? "latest"}`;
  const hit = cache.get(key);
  if (hit && (version != null || Date.now() - hit.at < TTL_MS)) return hit.brain;
  const rows = await sql()<
    { influencer_id: number; code: string; handle: string; version: number; prompt: string; prompt_tokens: number; model: string; created_at: Date; files: BrainFiles }[]
  >`
    select b.influencer_id, i.code, i.handle, b.version, b.prompt, b.prompt_tokens, b.model, b.created_at, b.files
    from brains b join influencers i on i.id = b.influencer_id
    where lower(i.handle) = lower(${handle}) ${version != null ? sql()`and b.version = ${version}` : sql()``}
    order by b.version desc limit 1`;
  const r = rows[0];
  if (!r) return null;
  const brain: LoadedBrain = {
    influencerId: r.influencer_id,
    code: r.code,
    handle: r.handle,
    version: r.version,
    prompt: r.prompt,
    promptTokens: r.prompt_tokens,
    model: r.model,
    createdAt: new Date(r.created_at).toISOString(),
    files: r.files,
  };
  cache.set(key, { at: Date.now(), brain });
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return brain;
}

/* ───────────────────────── references ───────────────────────── */

export type Reference = {
  n: number;
  postId: string;
  kind: "call" | "post";
  date: string | null;
  text: string | null;
  quoted: { author: string | null; text: string | null } | null;
  call: { ticker: string; direction: string; quote: string } | null;
  url: string;
};

/** Turn [post:ID] markers into numbered references with the post (and call) they point to. */
export async function resolveReferences(brain: LoadedBrain, text: string): Promise<Reference[]> {
  const ids = [...new Set([...text.matchAll(/\[post:(\d+)\]/g)].map((m) => m[1]))];
  if (!ids.length) return [];
  const known = new Set([...brain.files.example_ids, ...brain.files.calls.map((c) => c.post_id)]);
  const valid = ids.filter((id) => known.has(id));
  if (!valid.length) return [];
  const rows = await sql()<{ id: string; text: string; created_at: Date; quoted_author: string | null; quoted_text: string | null }[]>`
    select id, text, created_at, quoted_author, quoted_text from posts where id in ${sql()(valid)}`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return valid.map((id, i) => {
    const p = byId.get(id);
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
}

/** Latest real question asked on the site, for the home marquee (anonymous). */
export async function latestQuestions(limit = 8): Promise<{ q: string; code: string }[]> {
  if (!hasDatabase()) return [];
  try {
    return await sql()<{ q: string; code: string }[]>`
      select m.content as q, i.code
      from messages m
      join lateral (select influencer_id from messages a where a.chat_id = m.chat_id and a.role = 'assistant' and a.id > m.id order by a.id limit 1) a on true
      join influencers i on i.id = a.influencer_id
      where m.role = 'user' and length(m.content) between 8 and 120
      order by m.created_at desc limit ${limit}`;
  } catch {
    return [];
  }
}
