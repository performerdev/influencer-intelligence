"use client";

import { useEffect, useRef, useState } from "react";

import { XGlyph } from "@/components/account/AuthProvider";
import { TypingIndicator } from "@/components/chat/bits";
import { early } from "@/config/early";
import type { EarlyState } from "@/lib/server/early";

import { Coin } from "./Coin";
import { type CardHandle, EarlyCard } from "./EarlyCard";
import { EarlyDashboard, earlyColor, inviteUrl, quoteOnX } from "./EarlyDashboard";
import { PadlockCoin } from "./PadlockCoin";
import { Ticker } from "./Ticker";

/**
 * /early: Early Mind hands out early $ii. It's a script, not a model: free to
 * run however many people show up, and it can't be talked into anything.
 * Log in with X → wallet → three tasks behind a padlock → the card → invites.
 */

type Stage = "guest" | "login" | "wallet" | "tasks" | "done";
type Embed = "login" | "wallet" | "tasks" | "card" | "share" | "invite";
type Msg = { id: number; role: "mind" | "user" | "sys"; body: React.ReactNode; embed?: Embed; masked?: boolean };
type Post = { ok: true; state: EarlyState } | { ok: false; error: string; status: number };

const fmt = (n: number) => n.toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LOGIN = "/api/auth/x/login?next=%2Fearly";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const CHIPS: Record<Stage, string[]> = {
  guest: ["I want early allocation", "What is ii?", "How much $ii?"],
  login: ["Why log in with X?"],
  wallet: [],
  tasks: ["Why these tasks?"],
  done: ["How do I get more?", "When is the snapshot?"],
};

const ANSWERS: [RegExp, (s: EarlyState | null) => string][] = [
  [/what\s*(is|'s|s)\s*(ii|this|it)|what do you do|who are you/i, () => "ii turns the biggest CT accounts into AIs, built from every post they wrote. ask ansem what he'd do with your bag and see every call he ever made, checked against the price. early minds get $ii before anyone else."],
  [/how much|how many|amount|allocation size/i, () => `${fmt(early.base)} $ii for three quick tasks. then +${fmt(early.perInvite)} for every friend who gets in, up to ${early.maxInvites}. so ${fmt(early.base + early.perInvite * early.maxInvites)} max.`],
  [/when|snapshot|launch|tge|listing|date/i, (s) => `allocations are final at the snapshot. the date goes out on ${s?.settings.xHandle ? `@${s.settings.xHandle}` : "our X"} first, so that follow matters.`],
  [/more|100k|1m|million|double|bigger|extra/i, () => `${fmt(early.base)} for everyone, no favorites. invites are the only way up: +${fmt(early.perInvite)} each, up to ${early.maxInvites}.`],
  [/why.*(log|\bx\b|twitter)/i, () => "one allocation per X account, so i need to know it's you. we only see your handle and avatar. no password, and we can't post for you."],
  [/why.*task/i, () => "follow so you see the snapshot date. like, repost and reply so CT finds us. that's the whole deal."],
];

async function post(body: object): Promise<Post> {
  const r = await fetch("/api/early", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as (EarlyState & { error?: string }) | null;
  if (!r?.ok || !j) return { ok: false, status: r?.status ?? 0, error: j?.error ?? "That didn't save. Try again." };
  return { ok: true, state: j };
}

export function EarlyMind() {
  const [st, setSt] = useState<EarlyState | null>(null);
  const [stage, setStage] = useState<Stage>("guest");
  const [view, setView] = useState<"chat" | "dashboard" | "loading">("loading");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const ids = useRef(0);
  const seeded = useRef(false);
  const finished = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const card = useRef<CardHandle>(null);
  const stRef = useRef<EarlyState | null>(null);
  stRef.current = st;

  const push = (m: Omit<Msg, "id">) => setMsgs((x) => [...x, { ...m, id: ++ids.current }]);
  const say = async (body: React.ReactNode, embed?: Embed, wait = true) => {
    if (wait) {
      setTyping(true);
      await sleep(480 + Math.random() * 360);
      setTyping(false);
    }
    push({ role: "mind", body, embed });
  };
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? null : x)), 3200);
  };

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  // where this person is: the conversation picks up from there
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    fetch("/api/early", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<EarlyState>) : Promise.reject(r.status)))
      .then((s) => {
        setSt(s);
        if (!s.ready) {
          setView("chat");
          push({ role: "mind", body: "allocations open in a minute. come back shortly." });
          return;
        }
        if (s.stage === "done") {
          finished.current = true;
          setStage("done");
          setView("dashboard");
          return;
        }
        setView("chat");
        if (s.stage === "guest") {
          setStage("guest");
          push({ role: "mind", body: "gm. want early $ii? ask and i'll walk you through it. takes about a minute." });
        } else if (s.stage === "wallet") {
          setStage("wallet");
          push({ role: "sys", body: <>Logged in as @{s.handle}</> });
          push({ role: "mind", body: <>gm @{s.handle}. you&apos;re early. drop the solana wallet you want the $ii on.</>, embed: "wallet" });
        } else {
          setStage("tasks");
          push({ role: "mind", body: <>got it: <Code>{short(s.wallet ?? "")}</Code>. three quick ones and {fmt(early.base)} $ii is yours:</>, embed: "tasks" });
        }
      })
      .catch(() => {
        setView("chat");
        push({ role: "mind", body: "i'm out for a second. refresh in a bit." });
      });
  }, []);

  async function askLogin() {
    setStage("login");
    await say("gm anon. allocations go one per X account. log in so i know who you are.", "login");
  }

  async function saveWallet(addr: string) {
    push({ role: "user", body: addr });
    const r = await post({ action: "wallet", wallet: addr });
    if (!r.ok) return say(r.error.charAt(0).toLowerCase() + r.error.slice(1));
    setSt(r.state);
    setStage("tasks");
    await say(<>got it: <Code>{short(addr)}</Code>. three quick ones and {fmt(early.base)} $ii is yours:</>, "tasks");
  }

  async function send(raw: string) {
    const t = raw.trim();
    if (!t || typing) return;
    setInput("");
    if (stage === "wallet") {
      const words = t.split(/\s+/).filter(Boolean);
      if (words.length >= 12 && words.every((w) => /^[a-z]+$/i.test(w))) {
        push({ role: "user", body: "Hidden. That looked like a seed phrase.", masked: true });
        return say("stop. that's a seed phrase. never paste it anywhere, not here, not in any DM. it wasn't sent or saved. if you've pasted it somewhere before, move your funds to a new wallet. i only need the public address.");
      }
      if (BASE58.test(t)) return saveWallet(t);
    }
    push({ role: "user", body: t });
    for (const [re, answer] of ANSWERS) if (re.test(t)) return say(answer(stRef.current));
    if (stage === "guest") return askLogin();
    if (stage === "login") return say("tap Log in with X above. one allocation per account, so i need to know it's you.");
    if (stage === "wallet") return say("that's not a solana address. it's 32 to 44 letters and digits, no spaces. paste just the address.");
    if (stage === "tasks") {
      const s = stRef.current;
      const left = s ? [s.tasks.follow, s.tasks.repost, s.tasks.reply].filter((x) => !x).length : 3;
      return say(`${left} to go. finish them above and the ${fmt(early.base)} is yours.`);
    }
    return say(`you're in. invites are how you go higher: +${fmt(early.perInvite)} $ii per friend who gets in.`);
  }

  async function finish() {
    if (finished.current) return;
    finished.current = true;
    setStage("done");
    await say(<>3/3. you&apos;re in, @{stRef.current?.handle}. welcome to the early minds.</>, "card");
    await sleep(2600);
    await say("post it. quote the launch post with your card, that's how your friends find their way in.", "share");
  }

  async function afterShare() {
    if (shared) return;
    setShared(true);
    const s = stRef.current;
    if (!s) return;
    await say(
      <>
        last thing. your invite link is <Code>{inviteUrl(s.handle ?? "")}</Code>. every friend who gets in adds +{fmt(early.perInvite)} $ii to yours, up to {early.maxInvites}. they get their own {fmt(early.base)}.
      </>,
      "invite",
    );
  }

  const copyLink = async () => {
    const url = `https://${inviteUrl(stRef.current?.handle ?? "")}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Invite link copied");
    } catch {
      flash(url);
    }
  };

  /* ───────── embeds: drawn from the live state ───────── */
  const embed = (e: Embed) => {
    const s = st;
    if (e === "login")
      return s?.handle ? (
        <p className="flex items-center gap-2 font-pixel text-xs text-particle">
          <XGlyph size={11} /> Logged in as @{s.handle}
        </p>
      ) : (
        <div className="grid gap-3">
          <a href={LOGIN} className="btn-ceramic h-11 w-fit gap-2 px-5">
            <XGlyph size={12} /> Log in with X
          </a>
          <p className="text-xs text-muted">We only see your handle and avatar. We never post for you.</p>
        </div>
      );
    if (e === "wallet") return <WalletForm saved={stage !== "wallet" ? s?.wallet ?? null : null} onSave={saveWallet} />;
    if (e === "tasks" && s) return <Tasks st={s} onState={setSt} onOpen={finish} />;
    if (e === "card" && s?.number != null && s.handle)
      return (
        <figure className="grid gap-2">
          <EarlyCard ref={card} handle={s.handle} number={s.number} color={earlyColor(s.number)} animate />
          <figcaption className="flex justify-between gap-3 font-pixel text-[11px] text-muted">
            <span>Your card</span>
            <span>
              {fmt(early.base)} <Ticker /> reserved
            </span>
          </figcaption>
        </figure>
      );
    if (e === "share")
      return shared ? (
        <p className="font-pixel text-xs text-particle">Card ready to post</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ceramic h-11 gap-2 px-5"
            onClick={() => {
              if (s) quoteOnX(card.current, s, flash);
              void afterShare();
            }}
          >
            <XGlyph size={12} /> Quote on X ↗
          </button>
          <button type="button" className="btn-line h-11 px-5" onClick={() => void afterShare()}>
            Not now
          </button>
        </div>
      );
    if (e === "invite")
      return (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ceramic h-11 px-5" onClick={() => setView("dashboard")}>
            Open Early →
          </button>
          <button type="button" className="btn-line h-11 px-5" onClick={() => void copyLink()}>
            Copy invite link
          </button>
        </div>
      );
    return null;
  };

  const toastEl = toast && (
    <div role="status" className="fixed bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 z-[80] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-chip bg-ceramic px-4 py-2.5 text-center font-pixel text-xs text-void">
      {toast}
    </div>
  );

  if (view === "loading") return <div className="mx-auto h-[100svh] max-w-[860px] px-gutter pt-[calc(var(--ii-topbar-h)+40px)] font-pixel text-xs text-muted">Opening Early Mind…</div>;

  if (view === "dashboard" && st)
    return (
      <>
        <EarlyDashboard st={st} onState={setSt} onToast={flash} />
        {toastEl}
      </>
    );

  return (
    <div className="mx-auto flex h-[100svh] max-w-[880px] flex-col pt-topbar">
      <header className="flex items-center gap-3 border-b border-line px-gutter py-3">
        <Coin size={40} active={typing} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-particle">ii-00</span>
            <h1 className="font-pixel text-body">@early</h1>
          </div>
          <p className="truncate text-xs text-particle">Hands out $ii before launch. One allocation per X account.</p>
        </div>
        {stage === "done" && st?.number != null && (
          <button type="button" onClick={() => setView("dashboard")} className="btn-line h-9 shrink-0 px-3 text-xs">
            Your allocation →
          </button>
        )}
      </header>

      <div ref={scroll} data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-gutter" aria-live="polite">
        <div className="mx-auto max-w-[720px] py-8">
          <div className="flex items-center gap-5 border-b border-line pb-7">
            <Coin size={104} />
            <div>
              <p className="font-pixel text-h3">Early Mind</p>
              <p className="mt-1.5 max-w-[44ch] text-sm text-particle">Hands out $ii before launch. Ask for an allocation and it walks you through it.</p>
            </div>
          </div>
          <ol className="space-y-8 pt-8">
            {msgs.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end">
                  <p className={`max-w-[85%] whitespace-pre-wrap break-all rounded-panel border border-line bg-panel px-4 py-3 text-body ${m.masked ? "italic text-muted" : ""}`}>{m.body}</p>
                </li>
              ) : m.role === "sys" ? (
                <li key={m.id} className="flex justify-center">
                  <span className="flex items-center gap-2 font-pixel text-[11px] text-muted">
                    <XGlyph size={10} /> {m.body}
                  </span>
                </li>
              ) : (
                <li key={m.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <Coin size={20} />
                    <span className="font-mono text-xs text-particle">ii-00</span>
                  </div>
                  <div className="max-w-[62ch] text-body leading-relaxed">{m.body}</div>
                  {m.embed && <div className="mt-4 rounded-panel border border-line bg-panel p-4">{embed(m.embed)}</div>}
                </li>
              ),
            )}
            {typing && (
              <li className="flex items-center gap-2">
                <Coin size={20} active />
                <span className="font-mono text-xs text-particle">ii-00</span>
                <TypingIndicator />
              </li>
            )}
          </ol>
        </div>
      </div>

      <div className="border-t border-line bg-void px-gutter pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <form
          className="mx-auto flex max-w-[720px] items-center gap-2 rounded-input border border-line bg-panel p-2 transition-colors duration-fast focus-within:border-line-hover"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="early-input" className="sr-only">
            Message Early Mind
          </label>
          <input
            id="early-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={stage === "wallet" ? "Paste your Solana address" : "Ask Early Mind"}
            className="h-10 min-w-0 flex-1 bg-transparent px-2 text-body text-ceramic placeholder:text-muted focus:outline-none"
          />
          <button type="submit" disabled={typing || !input.trim()} className="btn-ceramic h-10 w-10 shrink-0 px-0 disabled:opacity-40" aria-label="Send">
            →
          </button>
        </form>
        {!typing && CHIPS[stage].length > 0 && (
          <div className="mx-auto mt-2 flex max-w-[720px] gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {CHIPS[stage].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => void send(c)}
                className="shrink-0 rounded-pill border border-line px-3 py-1.5 font-pixel text-xs text-particle transition-colors duration-fast hover:border-line-hover hover:text-ceramic"
              >
                {c.includes("$ii") ? (
                  <>
                    {c.split("$ii")[0]}
                    <Ticker />
                    {c.split("$ii")[1]}
                  </>
                ) : (
                  c
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {toastEl}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-chip border border-line bg-panel px-1.5 py-0.5 font-pixel text-[13px]">{children}</code>;
}

/* ───────── the wallet ───────── */

function WalletForm({ saved, onSave }: { saved: string | null; onSave: (w: string) => Promise<void> }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (saved) return <p className="font-pixel text-xs text-particle">Wallet saved · {short(saved)}</p>;
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const w = v.trim();
        if (!BASE58.test(w)) return setErr("That's not a Solana address. It's 32 to 44 letters and digits, no spaces.");
        setErr(null);
        setBusy(true);
        await onSave(w);
        setBusy(false);
      }}
    >
      <label htmlFor="early-wallet" className="label-mono">
        Solana wallet
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="early-wallet"
          value={v}
          onChange={(e) => setV(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your Solana address"
          className="h-10 min-w-0 flex-[1_1_260px] rounded-input border border-line-hover bg-void px-3 font-pixel text-sm text-ceramic placeholder:text-muted focus:border-particle focus:outline-none"
        />
        <button type="submit" disabled={busy} className="btn-ceramic h-10 px-4 text-sm">
          {busy ? "Saving…" : "Save wallet"}
        </button>
      </div>
      {err && (
        <p className="text-sm" style={{ color: "var(--ii-verdict-sell)" }}>
          {err}
        </p>
      )}
      <p className="text-xs text-muted">Only the public address. Never a seed phrase or a private key.</p>
    </form>
  );
}

/* ───────── the three tasks, behind the padlock ───────── */

type TaskId = "follow" | "repost" | "reply";
const TASKS: { id: TaskId; cap: string; title: (s: EarlyState) => string; sub: string; act: string; done: string }[] = [
  { id: "follow", cap: "Follow", title: (s) => (s.settings.xHandle ? `Follow @${s.settings.xHandle}` : "Follow us on X"), sub: "So you see the snapshot date.", act: "Follow ↗", done: "Following." },
  { id: "repost", cap: "Repost", title: () => "Like and repost the launch post", sub: "So CT finds us.", act: "Open post ↗", done: "Liked and reposted." },
  { id: "reply", cap: "Reply", title: () => "Reply to the launch post", sub: "Tell us who to turn into a mind next, then paste the link to your reply.", act: "Reply ↗", done: "Reply found." },
];

function Tasks({ st, onState, onOpen }: { st: EarlyState; onState: (s: EarlyState) => void; onOpen: () => void }) {
  const [local, setLocal] = useState<Partial<Record<TaskId, "opened" | "checking" | "paste">>>({});
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<Partial<Record<TaskId, string>>>({});
  const done = [st.tasks.follow, st.tasks.repost, st.tasks.reply].filter(Boolean).length;
  const open = st.stage === "done";
  const xh = st.settings.xHandle;
  const links: Record<TaskId, string | null> = {
    follow: xh ? `https://x.com/intent/follow?screen_name=${encodeURIComponent(xh)}` : null,
    repost: st.settings.launchUrl || (xh ? `https://x.com/${xh}` : null),
    reply: st.settings.launchId ? `https://x.com/intent/post?in_reply_to=${st.settings.launchId}` : xh ? `https://x.com/${xh}` : null,
  };

  const check = async (id: TaskId, body: object) => {
    setLocal((l) => ({ ...l, [id]: "checking" }));
    setErr((x) => ({ ...x, [id]: undefined }));
    const [r] = await Promise.all([post(body), sleep(1100)]);
    setLocal((l) => ({ ...l, [id]: r.ok ? undefined : id === "reply" ? "paste" : undefined }));
    if (!r.ok) return setErr((x) => ({ ...x, [id]: r.error }));
    onState(r.state);
  };

  const start = (id: TaskId) => {
    if (id === "reply") return setLocal((l) => ({ ...l, reply: "paste" }));
    setLocal((l) => ({ ...l, [id]: "opened" }));
    setTimeout(() => void check(id, { action: "task", task: id }), 800);
  };

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-4 pb-4">
        <div className="flex items-start gap-2">
          {TASKS.map((t, i) => {
            const isDone = st.tasks[t.id];
            const busy = local[t.id] === "checking";
            return (
              <div key={t.id} className="flex items-start gap-2">
                {i > 0 && <span className="grid h-12 place-items-center font-pixel text-h3 text-muted" aria-hidden>+</span>}
                <div className="grid w-[52px] justify-items-center gap-1.5">
                  <span
                    className={`relative grid h-12 w-12 place-items-center overflow-hidden rounded-chip border font-pixel text-h3 transition-colors duration-base ${
                      isDone ? "border-ceramic bg-ceramic text-void" : busy ? "border-ceramic text-ceramic" : "border-line-hover text-particle"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                    {busy && <i className="early-fill absolute bottom-0 left-0 block h-[3px] bg-ceramic" />}
                  </span>
                  <span className={`font-pixel text-[11px] ${isDone ? "text-ceramic" : "text-muted"}`}>{t.cap}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <span className="grid h-12 place-items-center font-pixel text-h3 text-muted" aria-hidden>
            =
          </span>
          <PadlockCoin done={open ? 3 : done} onOpen={onOpen} />
          <div>
            <p className={`font-pixel text-h2 leading-none transition-colors duration-base ${open ? "text-ceramic" : "text-particle"}`}>
              {fmt(early.base)} <Ticker />
            </p>
            <p className={`mt-2 font-pixel text-[11px] ${open ? "text-ceramic" : "text-muted"}`}>{open ? "Unlocked" : `Locked · ${done}/3`}</p>
          </div>
        </div>
      </div>

      {TASKS.map((t, i) => {
        const isDone = st.tasks[t.id];
        const state = local[t.id];
        const link = links[t.id];
        return (
          <div key={t.id} className="relative grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-t border-line py-3 sm:grid-cols-[26px_minmax(0,1fr)_auto]">
            <span className={`grid h-6 w-6 place-items-center border font-pixel text-xs ${isDone ? "border-ceramic bg-ceramic text-void" : "border-line-hover text-particle"}`}>{isDone ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <p className="font-pixel text-sm">{t.title(st)}</p>
              <p className="text-sm text-particle">
                {isDone ? t.done : state === "opened" ? "Waiting for you to come back…" : state === "checking" ? "Checking…" : t.sub}
              </p>
              {err[t.id] && (
                <p className="mt-1 text-sm" style={{ color: "var(--ii-verdict-sell)" }}>
                  {err[t.id]}
                </p>
              )}
            </div>
            {!isDone &&
              (link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => state !== "checking" && start(t.id)}
                  aria-disabled={state === "checking"}
                  className={`btn-line col-start-2 h-9 w-fit px-3 text-xs sm:col-start-auto ${state ? "opacity-60" : ""}`}
                >
                  {state && state !== "paste" ? "Opened on X" : t.act}
                </a>
              ) : (
                <span className="col-start-2 font-pixel text-xs text-muted sm:col-start-auto">Opens at launch</span>
              ))}
            {t.id === "reply" && !isDone && (state === "paste" || state === "checking") && (
              <form
                className="col-span-2 flex flex-wrap gap-2 sm:col-span-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void check("reply", { action: "reply", url: reply });
                }}
              >
                <label htmlFor="early-reply" className="sr-only">
                  Link to your reply
                </label>
                <input
                  id="early-reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={`https://x.com/${st.handle ?? "you"}/status/…`}
                  className="h-10 min-w-0 flex-[1_1_260px] rounded-input border border-line-hover bg-void px-3 font-pixel text-sm text-ceramic placeholder:text-muted focus:border-particle focus:outline-none"
                />
                <button type="submit" disabled={state === "checking" || !reply.trim()} className="btn-ceramic h-10 px-4 text-sm">
                  Check
                </button>
              </form>
            )}
            {state === "checking" && <i className="early-fill absolute -bottom-px left-0 block h-px bg-ceramic" />}
          </div>
        );
      })}
      <p className="border-t border-line pt-3 text-xs text-muted">We check all three again at the snapshot. Undo one and the allocation drops.</p>
    </div>
  );
}
