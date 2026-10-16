"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { XGlyph, useAuth } from "@/components/account/AuthProvider";
import { type Info, PayPanel } from "@/components/account/PlusCheckout";
import { AppLink } from "@/components/ui/AppLink";
import { formatCount } from "@/lib/intelligences";

type Quote = {
  handle: string;
  name: string | null;
  avatar: string | null;
  followers: number | null;
  estimatedPosts: number;
  breakdown: { parse: number; distill: number; cost: number; markup: number };
  priceUsd: number;
  withReplies?: { estimatedReplies: number; breakdown: { parse: number; distill: number; cost: number; markup: number; replies: number }; priceUsd: number };
};

const usd = (x: number) => `$${x.toFixed(2)}`;
const field = "w-full rounded-panel border border-line bg-panel px-4 py-3 text-body text-ceramic outline-none transition-colors placeholder:text-muted focus:border-line-hover";

/** Handle → price breakdown → pay in USDC → the build page. */
export function AddFlow({ enabled, initialHandle }: { enabled: boolean; initialHandle: string }) {
  const { me } = useAuth();
  const router = useRouter();
  const [handle, setHandle] = useState(initialHandle);
  const [q, setQ] = useState<Quote | null>(null);
  const [state, setState] = useState<"idle" | "quoting" | "checkout" | "paying">("idle");
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [co, setCo] = useState<{ jobId: string; checkout: Info } | null>(null);
  const [replies, setReplies] = useState(false);

  const getQuote = async (h = handle) => {
    if (!h.trim()) return;
    setState("quoting");
    setMsg(null);
    setQ(null);
    setReplies(false);
    const r = await fetch(`/api/add/quote?handle=${encodeURIComponent(h.trim())}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setState("idle");
    if (j.exists)
      return setMsg(
        <>
          @{j.handle} already has a brain.{" "}
          <AppLink href={`/i/${j.handle}`} className="text-ceramic underline decoration-line-hover underline-offset-4">
            Talk to it →
          </AppLink>
        </>,
      );
    if (j.building)
      return setMsg(
        <>
          That brain is already being built.{" "}
          <AppLink href={`/add/${j.jobId}`} className="text-ceramic underline decoration-line-hover underline-offset-4">
            Follow it →
          </AppLink>
        </>,
      );
    if (!r?.ok) return setMsg(j.error ?? "Couldn't get a price. Try again.");
    setQ(j);
  };

  // a handle in the link (/add?handle=…) quotes right away
  useEffect(() => {
    if (initialHandle && enabled) getQuote(initialHandle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkout = async () => {
    if (!q) return;
    setState("checkout");
    setMsg(null);
    const r = await fetch("/api/add/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: q.handle, replies: replies && !!q.withReplies }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setState("idle");
      if (j.jobId) return router.push(`/add/${j.jobId}`);
      return setMsg(j.error ?? "Couldn't start the checkout.");
    }
    setCo(j);
    setState("paying");
  };

  if (!enabled) return <p className="font-pixel text-sm text-muted">Adding brains opens shortly.</p>;

  if (co)
    return (
      <div className="space-y-6">
        <p className="font-pixel text-sm text-particle">Pay to start building @{q?.handle}&apos;s brain. This page moves on by itself once the payment lands.</p>
        <PayPanel co={co.checkout} onPaid={() => router.push(`/add/${co.jobId}`)} />
      </div>
    );

  // the price card follows the replies checkbox
  const b = replies && q?.withReplies ? q.withReplies.breakdown : (q?.breakdown ?? { parse: 0, distill: 0, cost: 0, markup: 2 });
  const price = replies && q?.withReplies ? q.withReplies.priceUsd : (q?.priceUsd ?? 0);
  const loginHref = `/api/auth/x/login?next=${encodeURIComponent(`/add?handle=${q?.handle ?? handle}`)}`;

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          getQuote();
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <label htmlFor="add-handle" className="sr-only">X handle</label>
        <input id="add-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or x.com/handle" autoComplete="off" spellCheck={false} className={field} />
        <button type="submit" disabled={state === "quoting" || !handle.trim()} className="btn-ceramic shrink-0">
          {state === "quoting" ? "Reading the account…" : "Get the price"}
        </button>
      </form>

      {msg && <p className="text-sm text-particle">{msg}</p>}

      {q && (
        <div className="rounded-panel border border-line bg-panel p-6">
          <div className="flex items-center gap-4">
            {q.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.avatar} alt="" width={56} height={56} className="h-14 w-14 rounded-panel" style={{ imageRendering: "pixelated" }} />
            )}
            <div className="min-w-0">
              <p className="truncate font-pixel text-h3">@{q.handle}</p>
              <p className="text-sm text-muted">
                {q.name ? `${q.name} · ` : ""}
                {q.followers != null ? `${formatCount(q.followers)} followers` : ""}
              </p>
            </div>
          </div>

          {q.withReplies && q.withReplies.estimatedReplies > 0 && (
            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-void p-4 transition-colors hover:border-line-hover">
              <input type="checkbox" checked={replies} onChange={(e) => setReplies(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--ii-ceramic)]" />
              <span className="min-w-0">
                <span className="block font-pixel text-sm text-ceramic">
                  Also read their replies · ~{formatCount(q.withReplies.estimatedReplies)} · {q.withReplies.priceUsd > q.priceUsd ? `+${q.withReplies.priceUsd - q.priceUsd} USDC` : "same price"}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  How they talk to people one-on-one: arguing, joking, answering questions. Each reply is read with the post it answers. The brain sounds more like them; it costs more to read.
                </span>
              </span>
            </label>
          )}

          <dl className="mt-6 font-mono text-sm">
            {(
              [
                [`Reading ~${formatCount(q.estimatedPosts)} own posts and threads (twitterapi.io)`, usd(b.parse - (replies ? (q.withReplies?.breakdown.replies ?? 0) : 0))],
                ...(replies && q.withReplies ? ([[`Reading ~${formatCount(q.withReplies.estimatedReplies)} replies + the posts they answer`, usd(q.withReplies.breakdown.replies)]] as const) : []),
                ["Distilling the brain (DeepSeek)", usd(b.distill)],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-1">
                <dt className="text-muted">{k}</dt>
                <dd className="flex-1 border-b border-dotted border-line" aria-hidden />
                <dd className="text-particle">{v}</dd>
              </div>
            ))}
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <dt className="text-particle">Real cost</dt>
              <dd className="text-particle">{usd(b.cost)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="text-muted">
                Our margin × {b.markup}
                {price > Math.ceil(b.cost * b.markup) ? ` · minimum ${price} USDC` : ", rounded up"}
              </dt>
              <dd className="text-muted">{usd(b.cost * b.markup)}</dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-body">
              <dt className="font-pixel text-ceramic">Price</dt>
              <dd className="font-pixel text-ceramic">{price} USDC</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            Estimated from the account&apos;s posting history. Live as soon as it&apos;s built — usually 10–40 minutes, longer for very big accounts. If the build fails, we rebuild or refund.
          </p>

          <div className="mt-6">
            {me?.user ? (
              <button onClick={checkout} disabled={state === "checkout"} className="btn-ceramic">
                {state === "checkout" ? "Preparing…" : `Pay ${price} USDC and build`}
              </button>
            ) : (
              <a href={loginHref} className="btn-ceramic">
                <XGlyph /> Log in with X to add
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
