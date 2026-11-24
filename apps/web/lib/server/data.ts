import "server-only";

import { type BrainFiles, NO_VIEW } from "@ii/brain-core";
import { type Sql, db } from "@ii/db";

import { type Tier, community } from "@/config/community";
import { intelligences as config } from "@/config/intelligences";
import { brainColor } from "@/lib/colors";
import type { Intelligence } from "@/lib/intelligences";
import { normalizeRefs } from "@/lib/refs";

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
  avatar_url: string | null;
  color: string | null;
  hidden: boolean;
  version: number | null;
  distilled_at: Date | null;
  followers: number | null;
  placement: Tier | null;
  added_by: number | null;
  added_by_handle: string | null;
  show_added_by: boolean;
  calls: number;
  created_at: Date | null;
};

/**
 * Launch brains in config order, then brains added by users (in code order).
 * Real numbers from the database where they exist (never invented); hidden
 * brains (taken down by hand) are left out everywhere. Each mind is Main or
 * Community (config/community.ts); the UI decides where each list shows.
 */
// Every page asks for the list of minds; it changes when a brain is built (weekly, or an Add), so a minute's memo is plenty.
let minds: { at: number; list: Promise<Intelligence[]> } | null = null;

export function loadIntelligences(): Promise<Intelligence[]> {
  if (minds && Date.now() - minds.at < 60_000) return minds.list;
  const list = readIntelligences();
  minds = { at: Date.now(), list };
  return list;
}

/** A new brain went live: read the list again on the next request. */
export const forgetIntelligences = () => {
  minds = null;
  people = null;
};

/** Main unless pinned, or added through Add by someone and under the follower line. */
export function tierOf(r: Pick<InfluencerRow, "placement" | "added_by" | "followers">): Tier {
  if (r.placement === "main" || r.placement === "community") return r.placement;
  if (r.added_by == null) return "main";
  return (r.followers ?? 0) >= community.mainFollowers ? "main" : "community";
}

async function readIntelligences(): Promise<Intelligence[]> {
  const base: Intelligence[] = config.map((c) => ({ ...c, oneLineMind: null, postsParsed: null, postsPerDay: null, distilledAt: null, tier: "main", addedBy: null, people: 0 }));
  if (!hasDatabase()) return base;
  try {
    // to_jsonb(row) ->> 'col' reads columns that a newer migration adds, and gives null until it ran
    const [rows, reach] = await Promise.all([
      sql()<InfluencerRow[]>`
        select i.id, i.code, i.handle, i.display_name, i.posts_parsed, i.posts_per_day, i.one_line_mind, i.status,
          i.avatar_url, i.color, coalesce(i.hidden, false) as hidden, i.followers, i.added_by, i.created_at,
          to_jsonb(i) ->> 'placement' as placement,
          u.handle as added_by_handle, coalesce((to_jsonb(u) ->> 'show_added_by')::boolean, true) as show_added_by,
          (select count(*)::int from calls c where c.influencer_id = i.id) as calls,
          b.version, b.created_at as distilled_at
        from influencers i
        left join users u on u.id = i.added_by
        left join lateral (select version, created_at from brains where influencer_id = i.id order by version desc limit 1) b on true
        order by i.code`,
      peopleByMind(),
    ]);
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const fill = (c: Intelligence, r: InfluencerRow): Intelligence => ({
      ...c,
      displayName: r.display_name ?? c.displayName,
      oneLineMind: r.one_line_mind,
      postsParsed: r.posts_parsed > 0 ? r.posts_parsed : null,
      postsPerDay: r.posts_per_day,
      distilledAt: r.distilled_at ? new Date(r.distilled_at).toISOString() : null,
      tier: tierOf(r),
      addedBy: r.added_by != null && r.show_added_by ? r.added_by_handle : null,
      people: reach.get(r.id) ?? 0,
      followers: r.followers,
      calls: r.calls,
      addedAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    });
    const launch = base.filter((c) => !byCode.get(c.code)?.hidden).map((c) => (byCode.has(c.code) ? fill(c, byCode.get(c.code)!) : c));
    const known = new Set(config.map((c) => c.code));
    const added = rows
      // an added mind shows once its brain exists: not while it's being built, not after a failed build
      .filter((r) => !known.has(r.code as Intelligence["code"]) && !r.hidden && r.version != null)
      .map((r) =>
        fill(
          {
            code: r.code as Intelligence["code"],
            handle: r.handle,
            displayName: "",
            color: r.color ?? brainColor(r.code),
            avatar: r.avatar_url ? `/api/avatar/${encodeURIComponent(r.handle)}` : undefined,
            added: true,
            oneLineMind: null,
            postsParsed: null,
            postsPerDay: null,
            distilledAt: null,
          },
          r,
        ),
      );
    return [...launch, ...added];
  } catch (err) {
    console.error("loadIntelligences:", err);
    return base;
  }
}

/* ───────────────────────── people per mind ───────────────────────── */

let people: { at: number; map: Promise<Map<number, number>> } | null = null;

/**
 * Different people each mind has answered: logged in with X, not the person
 * who added it, X account older than community.minAccountDays (unknown age
 * doesn't count yet: it's read at the next login). An All minds "no view"
 * isn't an answer. This is what builders earn $ii for.
 */
export function peopleByMind(): Promise<Map<number, number>> {
  if (people && Date.now() - people.at < 60_000) return people.map;
  const map = sql()<{ id: number; n: number }[]>`
      select m.influencer_id as id, count(distinct m.user_id)::int as n
      from messages m
      join influencers i on i.id = m.influencer_id
      join users u on u.id = m.user_id
      where m.role = 'assistant' and m.user_id is not null
        and m.user_id is distinct from i.added_by
        and m.content <> ${NO_VIEW}
        and (to_jsonb(u) ->> 'x_created_at')::timestamptz < now() - make_interval(days => ${community.minAccountDays})
      group by m.influencer_id`
    .then((rows) => new Map(rows.map((r) => [r.id, r.n])))
    .catch((err) => {
      console.error("peopleByMind:", err);
      people = null;
      return new Map<number, number>();
    });
  people = { at: Date.now(), map };
  return map;
}

/** One intelligence by handle (launch or added), or null. */
export async function findIntelligence(handle: string): Promise<Intelligence | null> {
  const h = handle.replace(/^@/, "").toLowerCase();
  return (await loadIntelligences()).find((i) => i.handle.toLowerCase() === h) ?? null;
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
  /** newest post the brain was built from */
  postsTo: string | null;
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
    { influencer_id: number; code: string; handle: string; version: number; prompt: string; prompt_tokens: number; model: string; created_at: Date; posts_to: Date | null; files: BrainFiles }[]
  >`
    select b.influencer_id, i.code, i.handle, b.version, b.prompt, b.prompt_tokens, b.model, b.created_at, b.posts_to, b.files
    from brains b join influencers i on i.id = b.influencer_id
    where lower(i.handle) = lower(${handle}) and not coalesce(i.hidden, false) ${version != null ? sql()`and b.version = ${version}` : sql()``}
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
    postsTo: r.posts_to ? new Date(r.posts_to).toISOString() : null,
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
  const ids = [...new Set([...normalizeRefs(text).matchAll(/\[post:(\d+)\]/g)].map((m) => m[1]))];
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
