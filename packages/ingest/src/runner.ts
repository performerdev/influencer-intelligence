import { type InfluencerRow, type Sql, recordSpend, refreshInfluencerCounts, spentUsd } from "@ii/db";

import { type PostKind, type XPage, type XSource, type XTweet, classify } from "./types";

export type IngestProgress = {
  phase: string;
  pages: number;
  billed: number;
  kept: number;
  oldest: Date | null;
  spentUsd: number;
};

export type IngestOptions = {
  /** hard cap on twitterapi spend for this influencer (all runs combined) */
  maxUsd: number;
  /** collect the author's own thread continuations (from:X to:X) */
  threads?: boolean;
  /** only fetch what's new since the last run */
  refresh?: boolean;
  /** also collect replies to other people (with the post each one answers) */
  replies?: boolean;
  onProgress?: (p: IngestProgress) => void;
};

export type IngestResult = { status: "done" | "budget"; kept: number; billed: number; spentUsd: number };

type StateRow = {
  phase: string;
  cursor: string | null;
  window_until: string | null;
  done: boolean;
  pages: number;
  tweets_billed: number;
  kept: number;
};

/**
 * Pull every public post of one account into `posts`. Resumable: each phase
 * stores its cursor after every page, so a crash or a budget stop picks up
 * exactly where it left off.
 *
 *   search    — the account's own posts and quotes, newest → oldest, in
 *               until_time windows with -filter:replies (reposts and replies
 *               to others are never fetched, so never billed)
 *   timeline  — optional (INGEST_USE_TIMELINE=true); returns reposts too
 *   threads   — the author's own replies to themselves (thread continuations)
 *   replies   — opt-in: replies to other people that say something (newest →
 *               oldest), then the posts they answer, fetched by id for context
 */
export async function ingestInfluencer(
  sql: Sql,
  source: XSource,
  inf: InfluencerRow,
  opts: IngestOptions,
): Promise<IngestResult> {
  await sql`update influencers set status = 'ingesting' where id = ${inf.id}`;

  // 1. Profile (cheap, refreshed daily) — gives the user id, display name and real counts.
  if (!inf.x_user_id || opts.refresh) {
    const p = await source.profile(inf.handle);
    await sql`
      update influencers set
        x_user_id = ${p.id}, display_name = ${p.name}, bio = ${p.bio}, followers = ${p.followers},
        statuses_count = ${p.statusesCount}, account_created_at = ${p.createdAt}, profile_fetched_at = now()
      where id = ${inf.id}`;
    inf = { ...inf, x_user_id: p.id, display_name: p.name, statuses_count: p.statusesCount, account_created_at: p.createdAt };
  }
  const selfId = inf.x_user_id!;
  const handle = inf.handle;

  let spent = await spentUsd(sql, inf.id, "twitterapi");
  const spentAtStart = spent;
  let totalKept = 0;
  let totalBilled = 0;

  const loadState = async (phase: string): Promise<StateRow> => {
    const [row] = await sql<StateRow[]>`select * from ingest_state where influencer_id = ${inf.id} and phase = ${phase}`;
    return row ?? { phase, cursor: null, window_until: null, done: false, pages: 0, tweets_billed: 0, kept: 0 };
  };
  const saveState = async (s: StateRow) => {
    await sql`
      insert into ingest_state (influencer_id, phase, cursor, window_until, done, pages, tweets_billed, kept, updated_at)
      values (${inf.id}, ${s.phase}, ${s.cursor}, ${s.window_until}, ${s.done}, ${s.pages}, ${s.tweets_billed}, ${s.kept}, now())
      on conflict (influencer_id, phase) do update set
        cursor = excluded.cursor, window_until = excluded.window_until, done = excluded.done, pages = excluded.pages,
        tweets_billed = excluded.tweets_billed, kept = excluded.kept, updated_at = now()`;
  };

  /** One request: bill it, keep what belongs, store. Returns the page and how many new rows landed. */
  const fetchPage = async (state: StateRow, call: () => Promise<XPage>, keepOnly?: PostKind, classifyOpts: { replies?: boolean } = {}) => {
    const page = await call();
    spent += page.costUsd;
    totalBilled += page.billed;
    await recordSpend(sql, {
      influencerId: inf.id,
      kind: "twitterapi",
      units: page.billed,
      usd: page.costUsd,
      meta: { phase: state.phase },
    });
    const kept = page.tweets
      .map((t) => ({ t, kind: classify(t, selfId, classifyOpts) }))
      .filter((x): x is { t: XTweet; kind: PostKind } => !!x.kind && (!keepOnly || x.kind === keepOnly));
    const inserted = await insertPosts(sql, inf.id, kept);
    totalKept += inserted;
    state.pages += 1;
    state.tweets_billed += page.billed;
    state.kept += inserted;
    const oldest = page.tweets.reduce<Date | null>((m, t) => (!m || t.createdAt < m ? t.createdAt : m), null);
    opts.onProgress?.({ phase: state.phase, pages: state.pages, billed: state.tweets_billed, kept: state.kept, oldest, spentUsd: spent });
    return { page, inserted, oldest };
  };

  // A first build's cap covers the account's whole history (resumable across runs).
  // A refresh's cap is for this run only: big accounts have long spent more than
  // the weekly $5 on their first build, and a lifetime cap stopped them at once.
  const capUsd = opts.refresh ? spentAtStart + opts.maxUsd : opts.maxUsd;
  const overBudget = () => spent + 0.004 > capUsd;
  const stop = async (): Promise<IngestResult> => {
    await refreshInfluencerCounts(sql, inf.id);
    return { status: "budget", kept: totalKept, billed: totalBilled, spentUsd: spent };
  };

  /** The post each stored reply answers, fetched by id in batches (deleted or protected parents stay empty). */
  const fetchParents = async (): Promise<boolean> => {
    const ph = await loadState("reply_parents");
    const batch = Number(process.env.REPLY_PARENT_BATCH ?? 50);
    for (;;) {
      if (overBudget()) {
        await saveState(ph);
        return false;
      }
      const rows = await sql<{ id: string; in_reply_to_id: string }[]>`
        select id, in_reply_to_id from posts
        where influencer_id = ${inf.id} and kind = 'reply' and reply_to_text is null and in_reply_to_id is not null
        order by created_at desc limit ${batch}`;
      if (!rows.length) break;
      const page = await source.tweetsByIds([...new Set(rows.map((r) => r.in_reply_to_id))]);
      spent += page.costUsd;
      totalBilled += page.billed;
      await recordSpend(sql, { influencerId: inf.id, kind: "twitterapi", units: page.billed, usd: page.costUsd, meta: { phase: "reply_parents" } });
      const byId = new Map(page.tweets.map((t) => [t.id, t]));
      const ids = rows.map((r) => r.id);
      const texts = rows.map((r) => byId.get(r.in_reply_to_id)?.text ?? "");
      const authors = rows.map((r) => byId.get(r.in_reply_to_id)?.authorHandle ?? "");
      await sql`
        update posts p set reply_to_text = v.t, reply_to_author = coalesce(p.reply_to_author, nullif(v.a, ''))
        from (select unnest(${sql.array(ids)}::text[]) as id, unnest(${sql.array(texts)}::text[]) as t, unnest(${sql.array(authors)}::text[]) as a) v
        where p.id = v.id`;
      ph.pages += 1;
      ph.tweets_billed += page.billed;
      ph.kept += page.tweets.length;
      await saveState(ph);
      opts.onProgress?.({ phase: ph.phase, pages: ph.pages, billed: ph.tweets_billed, kept: ph.kept, oldest: null, spentUsd: spent });
    }
    ph.done = true;
    await saveState(ph);
    return true;
  };
  const [{ on: repliesOn }] = await sql<{ on: boolean }[]>`
    select exists (select 1 from ingest_state where influencer_id = ${inf.id} and phase = 'replies') as on`;
  const wantReplies = !!opts.replies || repliesOn;

  // ── refresh: only what's new since the last stored post (search, so reposts and replies aren't billed) ──
  if (opts.refresh) {
    const [r] = await sql<{ t: Date | null }[]>`select max(created_at) as t from posts where influencer_id = ${inf.id}`;
    const since = r?.t ? Math.floor(new Date(r.t).getTime() / 1000) - 86_400 : 0;
    for (const [phase, query] of [
      ["refresh", `from:${handle} -filter:replies since_time:${since}`],
      ["refresh_threads", `from:${handle} to:${handle} since_time:${since}`],
      ["refresh_replies", `from:${handle} filter:replies since_time:${since}`],
    ] as const) {
      if (phase === "refresh_threads" && opts.threads === false) continue;
      if (phase === "refresh_replies" && !wantReplies) continue;
      const s: StateRow = { ...(await loadState(phase)), cursor: null, done: false };
      const keep = phase === "refresh_threads" ? "thread" : phase === "refresh_replies" ? "reply" : undefined;
      for (;;) {
        if (overBudget()) return stop();
        const { page } = await fetchPage(s, () => source.search({ query, cursor: s.cursor }), keep, { replies: phase === "refresh_replies" });
        s.cursor = page.nextCursor;
        if (!page.nextCursor || page.tweets.length === 0) break;
      }
      s.done = true;
      await saveState(s);
    }
    if (wantReplies && !(await fetchParents())) return stop();
    await refreshInfluencerCounts(sql, inf.id);
    return { status: "done", kept: totalKept, billed: totalBilled, spentUsd: spent };
  }

  // ── timeline (off by default: the timeline endpoint returns reposts too, and they're billed) ──
  const tl = await loadState("timeline");
  if (process.env.INGEST_USE_TIMELINE !== "true") tl.done = true;
  while (!tl.done) {
    if (overBudget()) return stop();
    const { page } = await fetchPage(tl, () => source.timeline({ userId: selfId, handle, cursor: tl.cursor }));
    tl.cursor = page.nextCursor;
    if (!page.nextCursor || page.tweets.length === 0) tl.done = true;
    await saveState(tl);
  }

  // ── search back-fill, in until_time windows ──
  const se = await loadState("search");
  const accountStart = inf.account_created_at ? Math.floor(new Date(inf.account_created_at).getTime() / 1000) : 0;
  let excludeReplies = process.env.SEARCH_EXCLUDE_REPLIES !== "false";
  while (!se.done) {
    if (se.window_until == null) {
      const [r] = await sql<{ t: Date | null }[]>`select min(created_at) as t from posts where influencer_id = ${inf.id} and kind <> 'thread'`;
      // Start from now (search-first), or below whatever the timeline already stored.
      se.window_until = String(r?.t ? Math.floor(new Date(r.t).getTime() / 1000) : Math.floor(Date.now() / 1000) + 60);
    }
    const until = Number(se.window_until);
    if (until <= accountStart) {
      se.done = true;
      break;
    }
    let windowMin = until;
    let windowRows = 0;
    for (;;) {
      if (overBudget()) {
        await saveState(se);
        return stop();
      }
      const query = `from:${handle} until_time:${until}${excludeReplies ? " -filter:replies" : ""}`;
      const { page, oldest } = await fetchPage(se, () => source.search({ query, cursor: se.cursor }));
      // Some providers reject -filter:replies silently; retry the window once without it.
      if (excludeReplies && !se.cursor && page.tweets.length === 0 && !page.nextCursor) {
        const probe = await fetchPage(se, () => source.search({ query: `from:${handle} until_time:${until}` }));
        if (probe.page.tweets.length > 0) {
          excludeReplies = false;
          se.cursor = probe.page.nextCursor;
          windowRows += probe.page.tweets.length;
          if (probe.oldest) windowMin = Math.min(windowMin, Math.floor(probe.oldest.getTime() / 1000));
          await saveState(se);
          if (!probe.page.nextCursor) break;
          continue;
        }
      }
      windowRows += page.tweets.length;
      if (oldest) windowMin = Math.min(windowMin, Math.floor(oldest.getTime() / 1000));
      se.cursor = page.nextCursor;
      await saveState(se);
      if (!page.nextCursor || page.tweets.length === 0) break;
    }
    // Next window starts where this one ended; stop when a window adds nothing older.
    se.cursor = null;
    if (windowRows === 0 || windowMin >= until) se.done = true;
    else se.window_until = String(windowMin);
    await saveState(se);
  }

  // ── own thread continuations ──
  if (opts.threads !== false) {
    const th = await loadState("threads");
    while (!th.done) {
      if (overBudget()) return stop();
      const { page } = await fetchPage(th, () => source.search({ query: `from:${handle} to:${handle}`, cursor: th.cursor }), "thread");
      th.cursor = page.nextCursor;
      if (!page.nextCursor || page.tweets.length === 0) th.done = true;
      await saveState(th);
    }
  }

  // ── replies to other people (opt-in), newest → oldest in until_time windows ──
  if (wantReplies) {
    const rp = await loadState("replies");
    while (!rp.done) {
      if (rp.window_until == null) rp.window_until = String(Math.floor(Date.now() / 1000) + 60);
      const until = Number(rp.window_until);
      if (until <= accountStart) {
        rp.done = true;
        break;
      }
      let windowMin = until;
      let windowRows = 0;
      for (;;) {
        if (overBudget()) {
          await saveState(rp);
          return stop();
        }
        const { page, oldest } = await fetchPage(
          rp,
          () => source.search({ query: `from:${handle} filter:replies until_time:${until}`, cursor: rp.cursor }),
          "reply",
          { replies: true },
        );
        windowRows += page.tweets.length;
        if (oldest) windowMin = Math.min(windowMin, Math.floor(oldest.getTime() / 1000));
        rp.cursor = page.nextCursor;
        await saveState(rp);
        if (!page.nextCursor || page.tweets.length === 0) break;
      }
      rp.cursor = null;
      if (windowRows === 0 || windowMin >= until) rp.done = true;
      else rp.window_until = String(windowMin);
      await saveState(rp);
    }
    if (!(await fetchParents())) return stop();
  }

  await refreshInfluencerCounts(sql, inf.id);
  return { status: "done", kept: totalKept, billed: totalBilled, spentUsd: spent };
}

async function insertPosts(sql: Sql, influencerId: number, rows: { t: XTweet; kind: PostKind }[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map(({ t, kind }) => ({
    id: t.id,
    influencer_id: influencerId,
    kind,
    text: t.text,
    created_at: t.createdAt,
    conversation_id: t.conversationId,
    in_reply_to_id: t.inReplyToId,
    quoted_id: t.quoted?.id ?? null,
    quoted_author: t.quoted?.author ?? null,
    quoted_text: t.quoted?.text ?? null,
    reply_to_author: kind === "reply" ? t.inReplyToHandle : null,
    likes: t.metrics.likes,
    reposts: t.metrics.reposts,
    replies: t.metrics.replies,
    quotes: t.metrics.quotes,
    views: t.metrics.views,
    lang: t.lang,
    // Raw API payloads are ~5× the text; skip them by default to stay inside the free database tier.
    raw: process.env.INGEST_KEEP_RAW === "true" ? sql.json(t.raw as never) : null,
  }));
  const res = await sql`insert into posts ${sql(values)} on conflict (id) do nothing returning id`;
  return res.length;
}
