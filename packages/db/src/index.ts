import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

export type Sql = postgres.Sql;

let client: Sql | null = null;

/**
 * Postgres client. Works with the Supabase session pooler (5432) or
 * transaction pooler (6543) — prepared statements are off for the latter.
 */
export function db(url = process.env.DATABASE_URL): Sql {
  if (client) return client;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  if (url.includes("[YOUR-PASSWORD]")) throw new Error("DATABASE_URL still contains [YOUR-PASSWORD] — put the database password in.");
  const ssl = process.env.DATABASE_SSL === "disable" || /localhost|127\.0\.0\.1/.test(url) ? false : "require";
  client = postgres(url, {
    ssl,
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    onnotice: () => {},
  });
  return client;
}

export async function closeDb() {
  if (client) await client.end({ timeout: 5 });
  client = null;
}

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Apply pending SQL migrations in filename order. Idempotent. */
export async function migrate(sql: Sql = db()): Promise<string[]> {
  await sql`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ version: string }[]>`select version from schema_migrations`).map((r) => r.version));
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const body = readFileSync(join(MIGRATIONS, file), "utf8");
    // Several CI jobs start at once: one applies each migration, the others wait and skip it.
    const ran = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(4242001)`;
      const [hit] = await tx`select 1 from schema_migrations where version = ${file}`;
      if (hit) return false;
      await tx.unsafe(body);
      await tx`insert into schema_migrations (version) values (${file})`;
      return true;
    });
    if (ran) applied.push(file);
  }
  return applied;
}

/* ───────────────────────── influencers ───────────────────────── */

export type InfluencerRow = {
  id: number;
  code: string;
  handle: string;
  x_user_id: string | null;
  display_name: string | null;
  statuses_count: number | null;
  account_created_at: Date | null;
  posts_parsed: number;
  posts_per_day: number | null;
  first_post_at: Date | null;
  last_post_at: Date | null;
  one_line_mind: string | null;
  status: string;
};

/** Make sure every configured intelligence has a row; returns them in code order. */
export async function upsertInfluencers(sql: Sql, list: { code: string; handle: string }[]): Promise<InfluencerRow[]> {
  for (const { code, handle } of list) {
    await sql`
      insert into influencers (code, handle) values (${code}, ${handle})
      on conflict (code) do update set handle = excluded.handle`;
  }
  return sql<InfluencerRow[]>`select * from influencers where code in ${sql(list.map((l) => l.code))} order by code`;
}

export async function getInfluencer(sql: Sql, codeOrHandle: string): Promise<InfluencerRow | null> {
  const h = codeOrHandle.replace(/^@/, "");
  const [row] = await sql<InfluencerRow[]>`
    select * from influencers where code = ${h} or lower(handle) = lower(${h}) limit 1`;
  return row ?? null;
}

/** Recount the real numbers shown on the site. */
export async function refreshInfluencerCounts(sql: Sql, influencerId: number) {
  await sql`
    update influencers i set
      posts_parsed  = s.n,
      first_post_at = s.first_at,
      last_post_at  = s.last_at,
      posts_per_day = s.recent / 90.0
    from (
      select count(*)::int as n, min(created_at) as first_at, max(created_at) as last_at,
             count(*) filter (where created_at > now() - interval '90 days')::int as recent
      from posts where influencer_id = ${influencerId}
    ) s
    where i.id = ${influencerId}`;
}

export async function recordSpend(
  sql: Sql,
  entry: { influencerId: number | null; kind: "twitterapi" | "llm" | "price"; units: number; usd: number; meta?: unknown },
) {
  await sql`
    insert into spend (influencer_id, kind, units, usd, meta)
    values (${entry.influencerId}, ${entry.kind}, ${entry.units}, ${entry.usd}, ${sql.json((entry.meta ?? null) as never)})`;
}

export async function spentUsd(sql: Sql, influencerId: number, kind?: string): Promise<number> {
  const [r] = kind
    ? await sql<{ usd: string | null }[]>`select sum(usd) as usd from spend where influencer_id = ${influencerId} and kind = ${kind}`
    : await sql<{ usd: string | null }[]>`select sum(usd) as usd from spend where influencer_id = ${influencerId}`;
  return Number(r?.usd ?? 0);
}
