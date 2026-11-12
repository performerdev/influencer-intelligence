import "server-only";

import { PublicKey } from "@solana/web3.js";
import { cookies } from "next/headers";

import { early } from "@/config/early";

import type { User } from "./auth";
import { sql } from "./data";

/**
 * Early Mind: one early $ii allocation per X account. Three tasks unlock it
 * (follow, like + repost the launch post, reply to it); every invited friend
 * who gets in adds a bonus. Tasks are stored as the person reports them and
 * re-checked before the snapshot. Nothing here costs model money.
 */

/* ───────────────────────── settings (edited on /admin) ───────────────────────── */

export type EarlySettings = { xHandle: string; launchUrl: string; launchId: string | null };

let cached: { at: number; s: EarlySettings } | null = null;

export async function earlySettings(): Promise<EarlySettings> {
  if (cached && Date.now() - cached.at < 30_000) return cached.s;
  const rows = await sql()<{ key: string; value: string }[]>`select key, value from settings where key in ('early_x_handle', 'early_launch_url')`.catch(() => []);
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  const launchUrl = get("early_launch_url");
  const s = { xHandle: get("early_x_handle"), launchUrl, launchId: launchUrl.match(/\/status\/(\d+)/)?.[1] ?? null };
  cached = { at: Date.now(), s };
  return s;
}

export async function saveEarlySettings(xHandle: string, launchUrl: string) {
  const db = sql();
  for (const [key, value] of [
    ["early_x_handle", xHandle],
    ["early_launch_url", launchUrl],
  ])
    await db`insert into settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
  cached = null;
}

/* ───────────────────────── state ───────────────────────── */

type Row = {
  user_id: number;
  wallet: string | null;
  follow_at: Date | null;
  repost_at: Date | null;
  reply_at: Date | null;
  reply_url: string | null;
  number: number | null;
  done_at: Date | null;
};

export type EarlyState = {
  /** false until the migration ran */
  ready: boolean;
  stage: "guest" | "wallet" | "tasks" | "done";
  handle: string | null;
  wallet: string | null;
  tasks: { follow: boolean; repost: boolean; reply: boolean };
  number: number | null;
  total: number;
  /** people this person invited: 0 logged in, 1 wallet, 2–3 tasks under way, 4 in */
  invites: { handle: string; step: number }[];
  /** early minds so far (everyone who finished) */
  minds: number;
  settings: EarlySettings;
};

const stepOf = (r: Pick<Row, "wallet" | "follow_at" | "repost_at" | "reply_at" | "done_at">) =>
  r.done_at ? 4 : r.wallet ? 1 + Math.min(2, [r.follow_at, r.repost_at, r.reply_at].filter(Boolean).length) : 0;

const missingTable = (e: unknown) => /relation "(early|settings)" does not exist/.test(String((e as Error)?.message ?? e));

/** The row for this person, created on first visit with whoever invited them (first invite wins). */
async function ensureRow(user: User) {
  const ref = (await cookies()).get(early.refCookie)?.value?.toLowerCase().replace(/^@/, "");
  let refId: number | null = null;
  if (ref && /^[a-z0-9_]{1,15}$/.test(ref) && ref !== user.handle.toLowerCase()) {
    const [r] = await sql()<{ id: number }[]>`select id from users where lower(handle) = ${ref} order by last_seen_at desc limit 1`;
    refId = r?.id ?? null;
  }
  await sql()`insert into early (user_id, referred_by) values (${user.id}, ${refId}) on conflict (user_id) do nothing`;
}

export async function earlyState(user: User | null): Promise<EarlyState> {
  const settings = await earlySettings();
  const empty: EarlyState = {
    ready: true,
    stage: user ? "wallet" : "guest",
    handle: user?.handle ?? null,
    wallet: null,
    tasks: { follow: false, repost: false, reply: false },
    number: null,
    total: early.base,
    invites: [],
    minds: 0,
    settings,
  };
  try {
    const [{ n: minds }] = await sql()<{ n: number }[]>`select count(*)::int as n from early where number is not null`;
    if (!user) return { ...empty, minds };
    await ensureRow(user);
    const [r] = await sql()<Row[]>`select * from early where user_id = ${user.id}`;
    const inv = await sql()<(Pick<Row, "wallet" | "follow_at" | "repost_at" | "reply_at" | "done_at"> & { handle: string })[]>`
      select u.handle, e.wallet, e.follow_at, e.repost_at, e.reply_at, e.done_at
      from early e join users u on u.id = e.user_id
      where e.referred_by = ${user.id}
      order by e.done_at nulls last, e.created_at limit 100`;
    const invites = inv.map((i) => ({ handle: i.handle, step: stepOf(i) }));
    const counted = Math.min(early.maxInvites, invites.filter((i) => i.step === 4).length);
    return {
      ...empty,
      minds,
      stage: !r?.wallet ? "wallet" : r.number == null ? "tasks" : "done",
      wallet: r?.wallet ?? null,
      tasks: { follow: !!r?.follow_at, repost: !!r?.repost_at, reply: !!r?.reply_at },
      number: r?.number ?? null,
      total: early.base + counted * early.perInvite,
      invites,
    };
  } catch (e) {
    if (missingTable(e)) return { ...empty, ready: false };
    throw e;
  }
}

/* ───────────────────────── actions ───────────────────────── */

type Result = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

/** A real Solana wallet address: base58, 32 bytes, on the curve (not a program address). */
export function solanaWallet(raw: unknown): string | null {
  const w = String(raw ?? "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) return null;
  try {
    const pk = new PublicKey(w);
    return pk.toBase58() === w && PublicKey.isOnCurve(pk.toBytes()) ? w : null;
  } catch {
    return null;
  }
}

const REPLY = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/;

export async function earlyAction(user: User, body: { action?: string; wallet?: string; task?: string; url?: string } | null): Promise<Result> {
  await ensureRow(user);
  const db = sql();
  const [row] = await db<Row[]>`select * from early where user_id = ${user.id}`;
  switch (body?.action) {
    case "wallet": {
      const w = solanaWallet(body.wallet);
      if (!w) return fail(400, "That's not a Solana wallet address. Paste the public address, 32 to 44 letters and digits.");
      try {
        await db`update early set wallet = ${w}, updated_at = now() where user_id = ${user.id}`;
      } catch (e) {
        if (/early_wallet|duplicate key/.test(String((e as Error)?.message))) return fail(409, "This wallet is already on another account. One wallet, one allocation.");
        throw e;
      }
      break;
    }
    case "task": {
      if (!row?.wallet) return fail(400, "Add your wallet first.");
      if (body.task === "follow") await db`update early set follow_at = coalesce(follow_at, now()), updated_at = now() where user_id = ${user.id}`;
      else if (body.task === "repost") await db`update early set repost_at = coalesce(repost_at, now()), updated_at = now() where user_id = ${user.id}`;
      else return fail(400, "Unknown task.");
      break;
    }
    case "reply": {
      if (!row?.wallet) return fail(400, "Add your wallet first.");
      const m = String(body.url ?? "").trim().match(REPLY);
      if (!m) return fail(400, "That's not a link to a post. Open your reply on X, tap Share, then Copy link.");
      if (m[1].toLowerCase() !== user.handle.toLowerCase()) return fail(400, `That reply is from @${m[1]}. Paste the one you posted as @${user.handle}.`);
      const url = `https://x.com/${m[1]}/status/${m[2]}`;
      await db`update early set reply_url = ${url}, reply_at = coalesce(reply_at, now()), updated_at = now() where user_id = ${user.id}`;
      break;
    }
    default:
      return fail(400, "Unknown action.");
  }
  // all three tasks and a wallet: the next number is theirs
  await db`
    update early set number = nextval('early_number'), done_at = now()
    where user_id = ${user.id} and number is null and wallet is not null
      and follow_at is not null and repost_at is not null and reply_at is not null`;
  return { ok: true };
}

/* ───────────────────────── admin ───────────────────────── */

export async function earlyCsv(): Promise<string> {
  const rows = await sql()<
    { handle: string; wallet: string | null; follow_at: Date | null; repost_at: Date | null; reply_at: Date | null; reply_url: string | null; number: number | null; done_at: Date | null; invited_by: string | null; invites_in: number; created_at: Date }[]
  >`
    select u.handle, e.wallet, e.follow_at, e.repost_at, e.reply_at, e.reply_url, e.number, e.done_at, r.handle as invited_by,
      (select count(*)::int from early x where x.referred_by = e.user_id and x.number is not null) as invites_in, e.created_at
    from early e join users u on u.id = e.user_id left join users r on r.id = e.referred_by
    order by e.number nulls last, e.created_at`;
  const cell = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["number", "handle", "wallet", "allocation", "invites_in", "invited_by", "follow_at", "repost_at", "reply_at", "reply_url", "done_at", "joined_at"];
  const lines = rows.map((r) =>
    [
      r.number,
      r.handle,
      r.wallet,
      r.number != null ? early.base + Math.min(early.maxInvites, r.invites_in) * early.perInvite : 0,
      r.invites_in,
      r.invited_by,
      r.follow_at,
      r.repost_at,
      r.reply_at,
      r.reply_url,
      r.done_at,
      r.created_at,
    ]
      .map(cell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}
