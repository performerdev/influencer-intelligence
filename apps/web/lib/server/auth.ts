import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { plans } from "@/config/plans";

import { sql } from "./data";

/**
 * Accounts: log in with X (OAuth 2.0 + PKCE, scopes tweet.read users.read —
 * no email), a signed session cookie, no third-party auth service.
 */

export const SESSION_COOKIE = "ii_session";
const OAUTH_COOKIE = "ii_oauth";
const SESSION_DAYS = 30;

/** HMAC key: SESSION_SECRET if set, otherwise derived from the (secret) database URL. */
function secret(): Buffer {
  const s = process.env.SESSION_SECRET || `ii-session:${process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || "dev"}`;
  return createHash("sha256").update(s).digest();
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function sign(payload: object): string {
  const body = b64u(JSON.stringify(payload));
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    if (p.exp && p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

/* ───────────────────────── users ───────────────────────── */

export type User = {
  id: number;
  x_id: string;
  handle: string;
  name: string | null;
  avatar_url: string | null;
  plus_until: Date | null;
  plus_spent_usd: string;
  session_started_at: Date | null;
  session_spent_usd: string;
  share_bonus_at?: Date | null;
};

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const s = verify<{ uid: number }>(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const [u] = await sql()<User[]>`select * from users where id = ${s.uid}`;
  return u ?? null;
}

export const isPlus = (u: User | null) => !!u?.plus_until && new Date(u.plus_until).getTime() > Date.now();

/* ───────────────────────── X OAuth 2.0 (PKCE) ───────────────────────── */

const X_AUTHORIZE = () => process.env.X_AUTHORIZE_URL || "https://x.com/i/oauth2/authorize";
const X_API = () => (process.env.X_API_BASE || "https://api.x.com").replace(/\/$/, "");
export const xLoginConfigured = () => Boolean(process.env.X_CLIENT_ID);

/**
 * The site's public address. On Netlify a function sees its per-deploy URL
 * (abc123--site.netlify.app), which X won't accept as a callback and where the
 * session cookie wouldn't apply — so prefer SITE_URL, then the host the visitor
 * actually used, then Netlify's primary URL.
 */
export function siteOrigin(req: Request): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && !/^[0-9a-f]{20,}--/.test(host)) return `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  if (process.env.URL) return process.env.URL.replace(/\/$/, "");
  return new URL(req.url).origin;
}

const callbackUrl = (req: Request) => `${siteOrigin(req)}/api/auth/x/callback`;

/** Only same-site paths after login. */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export async function startXLogin(req: Request): Promise<Response> {
  if (!xLoginConfigured()) return Response.redirect(`${siteOrigin(req)}/account?error=x-not-configured`, 302);
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const state = b64u(randomBytes(18));
  const verifier = b64u(randomBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, sign({ state, verifier, next, exp: Math.floor(Date.now() / 1000) + 600 }), { ...cookieBase, maxAge: 600 });
  const url = new URL(X_AUTHORIZE());
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID!,
    redirect_uri: callbackUrl(req),
    // the two basic permissions: read posts, read profile — never email
    scope: "tweet.read users.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return Response.redirect(url.toString(), 302);
}

export async function finishXLogin(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const saved = verify<{ state: string; verifier: string; next: string }>(jar.get(OAUTH_COOKIE)?.value);
  jar.delete(OAUTH_COOKIE);
  const fail = (why: string) => Response.redirect(`${siteOrigin(req)}/account?error=${why}`, 302);
  if (q.get("error")) return fail("x-denied");
  if (!saved || !q.get("code") || q.get("state") !== saved.state) return fail("x-state");

  const basic = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET ?? ""}`).toString("base64");
  const tokenRes = await fetch(`${X_API()}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(process.env.X_CLIENT_SECRET ? { Authorization: `Basic ${basic}` } : {}),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: q.get("code")!,
      redirect_uri: callbackUrl(req),
      code_verifier: saved.verifier,
      client_id: process.env.X_CLIENT_ID!,
    }),
  });
  if (!tokenRes.ok) {
    console.error("x token:", tokenRes.status, (await tokenRes.text()).slice(0, 300));
    return fail("x-token");
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const meRes = await fetch(`${X_API()}/2/users/me?user.fields=profile_image_url,name,username`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) {
    console.error("x me:", meRes.status, (await meRes.text()).slice(0, 300));
    return fail("x-profile");
  }
  const { data: me } = (await meRes.json()) as { data: { id: string; username: string; name?: string; profile_image_url?: string } };
  // The access token is used once, for the profile, and never stored.
  const [u] = await sql()<{ id: number }[]>`
    insert into users (x_id, handle, name, avatar_url) values (${me.id}, ${me.username}, ${me.name ?? null}, ${me.profile_image_url ?? null})
    on conflict (x_id) do update set handle = excluded.handle, name = excluded.name, avatar_url = excluded.avatar_url, last_seen_at = now()
    returning id`;
  jar.set(SESSION_COOKIE, sign({ uid: u.id, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 }), { ...cookieBase, maxAge: SESSION_DAYS * 86400 });
  return Response.redirect(`${siteOrigin(req)}${saved.next}`, 302);
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/* ───────────────────────── usage ───────────────────────── */

export type Usage = {
  plan: "guest" | "free" | "plus";
  /** 0..1 of the current session budget */
  used: number;
  sessionUsd: number;
  spentUsd: number;
  resetsAt: string | null;
  /** Plus past its fair-use ceiling this period: session falls back to the free size */
  capped: boolean;
  maxAnswerTokens: number;
  debate: boolean;
};

export function usageOf(u: User | null): Usage {
  if (!u) return { plan: "guest", used: 0, sessionUsd: 0, spentUsd: 0, resetsAt: null, capped: false, maxAnswerTokens: plans.free.maxAnswerTokens, debate: false };
  const plus = isPlus(u);
  const capped = plus && Number(u.plus_spent_usd) >= plans.plus.periodCapUsd;
  const p = plus ? plans.plus : plans.free;
  const sessionUsd = capped ? plans.free.sessionUsd : p.sessionUsd;
  const start = u.session_started_at ? new Date(u.session_started_at).getTime() : 0;
  const live = start && Date.now() - start < p.sessionHours * 3600_000;
  const spent = live ? Number(u.session_spent_usd) : 0;
  return {
    plan: plus ? "plus" : "free",
    used: Math.min(1, spent / sessionUsd),
    sessionUsd,
    spentUsd: spent,
    resetsAt: live ? new Date(start + p.sessionHours * 3600_000).toISOString() : null,
    capped,
    maxAnswerTokens: p.maxAnswerTokens,
    debate: p.debate,
  };
}

export type Gate = { ok: true; user: User | null; usage: Usage } | { ok: false; status: number; body: { error: string; reason: "login" | "limit"; resetsAt?: string | null; plan?: string } };

/**
 * May this visitor ask one more question? Guests get one message per day,
 * then the login wall; logged-in users spend a session budget in real model cost.
 */
export async function gate(clientHash: string): Promise<Gate> {
  const user = await currentUser();
  if (!user) {
    const [{ n }] = await sql()<{ n: number }[]>`
      select count(*)::int as n from messages
      where client_hash = ${clientHash} and role = 'user' and user_id is null and created_at > now() - make_interval(hours => ${xLoginConfigured() ? plans.guest.windowHours : 24})`;
    // Until X login is switched on there is nowhere to send guests, so they keep a daily allowance instead.
    const allowed = xLoginConfigured() ? plans.guest.messages : Number(process.env.GUEST_DAILY_LIMIT_WITHOUT_LOGIN ?? 40);
    if (n >= allowed) {
      return xLoginConfigured()
        ? { ok: false, status: 401, body: { error: "Log in with X to keep talking — it's free.", reason: "login" } }
        : { ok: false, status: 429, body: { error: "That's today's limit. Come back tomorrow.", reason: "limit" } };
    }
    return { ok: true, user: null, usage: usageOf(null) };
  }
  const usage = usageOf(user);
  if (usage.used >= 1) {
    return {
      ok: false,
      status: 429,
      body: {
        error: usage.plan === "plus" ? "This session's usage is spent. It refills when the session resets." : "Free session used up. It refills every 4 hours — or go Plus for 6× more.",
        reason: "limit",
        resetsAt: usage.resetsAt,
        plan: usage.plan,
      },
    };
  }
  return { ok: true, user, usage };
}

/** Add real model cost to the user's session (and Plus period). Starts a new session when the last one expired. */
export async function charge(user: User | null, usd: number) {
  if (!user || !(usd > 0)) return;
  const hours = isPlus(user) ? plans.plus.sessionHours : plans.free.sessionHours;
  await sql()`
    update users set
      session_spent_usd = case when session_started_at is null or session_started_at < now() - make_interval(hours => ${hours}) then ${usd} else session_spent_usd + ${usd} end,
      session_started_at = case when session_started_at is null or session_started_at < now() - make_interval(hours => ${hours}) then now() else session_started_at end,
      plus_spent_usd = case when plus_until > now() then plus_spent_usd + ${usd} else plus_spent_usd end,
      last_seen_at = now()
    where id = ${user.id}`;
}
