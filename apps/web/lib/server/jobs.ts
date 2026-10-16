import "server-only";

import { MARKUP, PARSE_PRICE_PER_1K_POSTS, llmPrice } from "../../../../config/pricing";

import { sql } from "./data";

/**
 * "Add a brain": anyone pays the quoted price (real API cost × MARKUP) in
 * USDC, the build runs in GitHub Actions (scripts/cli.ts `jobs`), and the
 * brain is published the moment it's ready. No server of our own.
 */

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
export const normalizeHandle = (h: string) => h.trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
export const validHandle = (h: string) => HANDLE.test(h);

const MIN_PRICE_USD = Number(process.env.ADD_MIN_USD ?? 2);
const MAX_PARSE_USD = Number(process.env.ADD_MAX_PARSE_USD ?? 60);
const DISTILL_MODEL = process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro";
const MAP_MODEL = process.env.LLM_MODEL_MAP ?? "deepseek-flash";

export type Profile = { id: string; handle: string; name: string | null; avatar: string | null; followers: number | null; statuses: number | null; createdAt: string | null; protected: boolean };
export type Breakdown = { parse: number; distill: number; cost: number; markup: number };
export type Quote = {
  handle: string;
  profile: Profile;
  estimatedPosts: number;
  breakdown: Breakdown;
  priceUsd: number;
  /** spend cap for reading posts during the build */
  maxParseUsd: number;
  /** the same build, also reading replies to other people (and the post each one answers) */
  withReplies: { estimatedReplies: number; breakdown: Breakdown & { replies: number }; priceUsd: number; maxParseUsd: number };
};

const base = () => (process.env.TWITTERAPI_IO_BASE_URL ?? "https://api.twitterapi.io").replace(/\/$/, "");
export const addConfigured = () => Boolean(process.env.TWITTERAPI_IO_KEY);

async function tapi(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`${base()}${path}?${new URLSearchParams(params)}`, { headers: { "X-API-Key": process.env.TWITTERAPI_IO_KEY ?? "" }, signal: AbortSignal.timeout(10_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.status === "error") throw new Error(j?.message ?? j?.msg ?? `twitterapi.io ${res.status}`);
  return j;
}

export async function fetchProfile(handle: string): Promise<Profile | null> {
  const j = await tapi("/twitter/user/info", { userName: handle });
  const u = j?.data ?? j?.user ?? j;
  if (!u?.id || u?.unavailable) return null;
  return {
    id: String(u.id),
    handle: String(u.userName ?? handle),
    name: u.name ?? null,
    avatar: typeof u.profilePicture === "string" ? u.profilePicture.replace("_normal", "_400x400") : null,
    followers: Number(u.followers ?? 0) || null,
    statuses: Number(u.statusesCount ?? 0) || null,
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
    protected: Boolean(u.protected),
  };
}

/**
 * Price for one brain, from the account's real posting rate (one search page)
 * over its life — the same estimate the CLI's probe prints.
 */
export async function quote(handle: string): Promise<Quote | { error: string }> {
  const profile = await fetchProfile(handle).catch(() => null);
  if (!profile) return { error: `Couldn't find @${handle} on X.` };
  if (profile.protected) return { error: `@${profile.handle} is a private account — only public posts can be used.` };
  const ageDays = profile.createdAt ? (Date.now() - new Date(profile.createdAt).getTime()) / 86_400_000 : 365;
  const cap = profile.statuses ?? 5000;
  // one search page each: the account's own posts, and its replies to other people
  const [ownPage, replyPage] = await Promise.all([
    tapi("/twitter/tweet/advanced_search", { query: `from:${profile.handle} -filter:replies`, queryType: "Latest" }).catch(() => null),
    tapi("/twitter/tweet/advanced_search", { query: `from:${profile.handle} filter:replies`, queryType: "Latest" }).catch(() => null),
  ]);
  const estimate = (j: any, limit: number) => {
    const tweets: any[] = j?.tweets ?? j?.data?.tweets ?? [];
    const own = tweets.filter((t) => !t?.retweeted_tweet && String(t?.author?.id ?? profile.id) === profile.id);
    const times = own.map((t) => new Date(t.createdAt).getTime()).filter((x) => !Number.isNaN(x));
    const spanDays = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 86_400_000 : 0;
    // fewer than a page of results: the whole history is about that size
    const rate = spanDays > 0.5 ? own.length / spanDays : 0;
    return Math.max(own.length, Math.round(Math.min(limit, rate * ageDays * 0.6)));
  };
  const posts = estimate(ownPage, cap);
  const withThreads = Math.round(posts * 1.12);
  // replies share the account's tweet count with posts (reposts too)
  const replies = estimate(replyPage, Math.max(0, cap - posts));

  const pm = llmPrice(MAP_MODEL);
  const pr = llmPrice(DISTILL_MODEL);
  const price = (reading: number, tokensIn: number): Breakdown => {
    const batches = Math.max(1, Math.ceil(tokensIn / 40_000));
    const distill = (tokensIn * pm.inputMiss + batches * 5_000 * pm.output + batches * 5_000 * pr.inputMiss + 40_000 * pr.output) / 1e6 + 0.05;
    return { parse: round(reading), distill: round(distill), cost: round(reading + distill), markup: MARKUP };
  };
  const postsRead = (withThreads / 1000) * PARSE_PRICE_PER_1K_POSTS * 1.05 + 0.02;
  const base = price(postsRead, withThreads * 60);
  // each reply is read, and so is the post it answers; ~60% say something and go to the model, with that post as context
  const repliesRead = ((replies * 2) / 1000) * PARSE_PRICE_PER_1K_POSTS * 1.05;
  const full = price(postsRead + repliesRead, withThreads * 60 + replies * 0.6 * 110);
  const priceOf = (b: Breakdown) => Math.max(MIN_PRICE_USD, Math.ceil(b.cost * MARKUP));
  return {
    handle: profile.handle,
    profile,
    estimatedPosts: withThreads,
    breakdown: base,
    priceUsd: priceOf(base),
    maxParseUsd: Math.min(MAX_PARSE_USD, round(postsRead * 1.6 + 1)),
    withReplies: {
      estimatedReplies: replies,
      breakdown: { ...full, replies: round(repliesRead) },
      priceUsd: priceOf(full),
      maxParseUsd: Math.min(MAX_PARSE_USD, round((postsRead + repliesRead) * 1.6 + 1)),
    },
  };
}

const round = (x: number) => Math.round(x * 100) / 100;

export type JobView = {
  id: string;
  handle: string;
  status: string;
  progress: Record<string, unknown>;
  quoteUsd: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export async function loadJob(id: string): Promise<JobView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [j] = await sql()<{ id: string; handle: string; status: string; progress: Record<string, unknown>; quote_usd: string | null; error: string | null; created_at: Date; finished_at: Date | null }[]>`
    select id, handle, status, progress, quote_usd, error, created_at, finished_at from jobs where id = ${id} and kind = 'add_brain'`;
  if (!j) return null;
  return {
    id: j.id,
    handle: j.handle,
    status: j.status,
    progress: j.progress ?? {},
    quoteUsd: j.quote_usd != null ? Number(j.quote_usd) : null,
    error: j.status === "failed" ? "The build hit a problem. We'll rebuild it or refund you." : null,
    createdAt: new Date(j.created_at).toISOString(),
    finishedAt: j.finished_at ? new Date(j.finished_at).toISOString() : null,
  };
}

/** A brain that exists or is on its way for this handle. */
export async function existingFor(handle: string): Promise<{ kind: "live"; handle: string } | { kind: "building"; jobId: string } | null> {
  const db = sql();
  const [inf] = await db<{ handle: string; has_brain: boolean; hidden: boolean }[]>`
    select handle, exists (select 1 from brains b where b.influencer_id = i.id) as has_brain, coalesce(hidden, false) as hidden
    from influencers i where lower(handle) = lower(${handle}) limit 1`;
  if (inf?.hidden) return { kind: "live", handle: inf.handle }; // taken down: not offered again
  if (inf?.has_brain) return { kind: "live", handle: inf.handle };
  const [job] = await db<{ id: string }[]>`
    select id from jobs where kind = 'add_brain' and lower(handle) = lower(${handle}) and status in ('queued', 'parsing', 'distilling', 'building') order by created_at desc limit 1`;
  return job ? { kind: "building", jobId: job.id } : null;
}

/** Wake the build worker now (GitHub Actions); without a token the 10-minute schedule picks the job up. */
export async function dispatchJobs(): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return false;
  const repo = process.env.GITHUB_REPO ?? "performerdev/influencer-intelligence";
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/brains.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ ref: "main", inputs: { command: "jobs", target: "jobs" } }),
      signal: AbortSignal.timeout(8000),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}
