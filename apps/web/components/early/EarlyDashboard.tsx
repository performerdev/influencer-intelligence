"use client";

import { useRef, useState } from "react";

import { XGlyph } from "@/components/account/AuthProvider";
import { early, earlyCode } from "@/config/early";
import { brainColor } from "@/lib/colors";
import type { EarlyState } from "@/lib/server/early";

import { type CardHandle, EarlyCard } from "./EarlyCard";
import { Ticker } from "./Ticker";

const fmt = (n: number) => n.toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const STEPS = ["Logged in", "Wallet added", "1 of 3 tasks", "2 of 3 tasks", "In"];

/** Each early mind's color: same lightness and chroma as the brains, hue stepped by number. */
export const earlyColor = (n: number) => brainColor(`early-${n}`);

export const inviteUrl = (handle: string) => `${typeof window !== "undefined" ? window.location.host : "ii.plus"}/e/${handle.toLowerCase()}`;

/** Copy the card, then open X with the text filled in and the launch post quoted. */
export function quoteOnX(card: CardHandle | null, s: EarlyState, flash: (t: string) => void) {
  if (s.number == null || !s.handle) return;
  const text = `I'm early. Mind ${earlyCode(s.number)}, ${fmt(early.base)} $ii reserved.\n\nEvery CT mind, now an AI → ${inviteUrl(s.handle)}`;
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set("text", text);
  if (s.settings.launchUrl) u.searchParams.set("url", s.settings.launchUrl);
  // start the copy while this page still has focus, then open X
  let copying: Promise<boolean> = Promise.resolve(false);
  if (card && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = card.blob().then((b) => b ?? Promise.reject(new Error("no card")));
    copying = navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(
      () => true,
      () => false,
    );
  }
  window.open(u.toString(), "_blank", "noopener,noreferrer");
  void copying.then((ok) => flash(ok ? "Card copied. Paste it into the post with ⌘V or Ctrl+V." : "Download the card and add it to the post."));
}

/** /early once you're in: your card, your allocation, your invites. */
export function EarlyDashboard({ st, onState, onToast }: { st: EarlyState; onState: (s: EarlyState) => void; onToast: (t: string) => void }) {
  const card = useRef<CardHandle>(null);
  const [editing, setEditing] = useState(false);
  const [wallet, setWallet] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (st.number == null || !st.handle) return null;
  const color = earlyColor(st.number);
  const inviteCount = st.invites.filter((i) => i.step === 4).length;
  const counted = Math.min(early.maxInvites, inviteCount);
  let paid = 0;

  const copyCard = async () => {
    try {
      const blob = card.current?.blob().then((b) => b ?? Promise.reject(new Error("no card")));
      if (!blob) throw new Error("no card");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      onToast("Card copied");
    } catch {
      onToast("Your browser didn't let us copy it. Use Download.");
    }
  };
  const download = () => {
    const url = card.current?.dataUrl();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `ii-early-${earlyCode(st.number!)}.png`;
    a.click();
  };
  const copyLink = async () => {
    const url = `https://${inviteUrl(st.handle!)}`;
    try {
      await navigator.clipboard.writeText(url);
      onToast("Invite link copied");
    } catch {
      onToast(url);
    }
  };
  const saveWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/early", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "wallet", wallet: wallet.trim() }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as (EarlyState & { error?: string }) | null;
    if (!r?.ok || !j) return setErr(j?.error ?? "That didn't save. Try again.");
    onState(j);
    setEditing(false);
    onToast("Wallet updated");
  };

  const row = "flex items-center justify-between gap-3 border-t border-line py-2.5";
  return (
    <div className="mx-auto max-w-[1080px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+32px)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-h1">Early</h1>
          <p className="mt-2 text-particle">
            Your <Ticker /> allocation and invites. Everything is final at the snapshot.
          </p>
        </div>
        <p className="font-pixel text-[11px] text-muted">{fmt(st.minds)} early minds so far</p>
      </div>

      <div className="mt-8 grid gap-3.5 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <figure className="grid min-w-0 gap-3 rounded-panel border border-line bg-panel p-4">
          <EarlyCard ref={card} handle={st.handle} number={st.number} color={color} />
          <figcaption className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-pixel text-[11px] text-muted">
              {earlyCode(st.number)} · @{st.handle}
            </span>
            <span className="flex flex-wrap gap-2">
              <button type="button" onClick={download} className="btn-line h-9 px-3 text-xs">
                Download
              </button>
              <button type="button" onClick={() => void copyCard()} className="btn-line h-9 px-3 text-xs">
                Copy card
              </button>
              <button type="button" onClick={() => quoteOnX(card.current, st, onToast)} className="btn-ceramic h-9 gap-2 px-3 text-xs">
                <XGlyph size={10} /> Quote on X ↗
              </button>
            </span>
          </figcaption>
        </figure>

        <section aria-label="Allocation" className="min-w-0 rounded-panel border border-line bg-panel p-5">
          <p className="label-mono">Allocation</p>
          <p className="mb-5 mt-3 font-pixel text-h1 leading-none">
            {fmt(st.total)} <span style={{ color }}><Ticker /></span>
          </p>
          <div className="font-pixel text-sm">
            <div className={row}>
              <span className="text-particle">Tasks · 3/3</span>
              <span className="tabular-nums">{fmt(early.base)}</span>
            </div>
            <div className={row}>
              <span className="text-particle">
                Invites · {counted} of {early.maxInvites}
              </span>
              <span className="tabular-nums">+{fmt(counted * early.perInvite)}</span>
            </div>
            <div className={row}>
              <span className="text-particle">Status</span>
              <span>Reserved</span>
            </div>
            <div className={row}>
              <span className="text-particle">Wallet</span>
              <span className="flex items-center gap-3">
                {short(st.wallet ?? "")}
                <button type="button" onClick={() => setEditing((x) => !x)} className="text-xs text-muted underline decoration-line-hover underline-offset-4 hover:text-ceramic">
                  {editing ? "Cancel" : "Change"}
                </button>
              </span>
            </div>
            {editing && (
              <form onSubmit={saveWallet} className="grid gap-2 border-t border-line pt-3">
                <label htmlFor="early-wallet-change" className="sr-only">
                  New Solana wallet
                </label>
                <div className="flex gap-2">
                  <input
                    id="early-wallet-change"
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="New Solana address"
                    className="h-9 min-w-0 flex-1 rounded-input border border-line-hover bg-void px-3 font-pixel text-xs text-ceramic placeholder:text-muted focus:border-particle focus:outline-none"
                  />
                  <button type="submit" className="btn-ceramic h-9 px-3 text-xs">
                    Save
                  </button>
                </div>
                {err && (
                  <p className="font-sans text-xs" style={{ color: "var(--ii-verdict-sell)" }}>
                    {err}
                  </p>
                )}
              </form>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">We check the follow, repost and reply again at the snapshot. Undo one and this drops to 0.</p>
        </section>
      </div>

      <section aria-label="Invites" className="mt-3.5 grid gap-4 rounded-panel border border-line bg-panel p-5">
        <div>
          <p className="label-mono">Invite friends</p>
          <p className="mt-2 text-sm text-particle">
            Each friend who gets in adds{" "}
            <span className="font-pixel text-ceramic">
              +{fmt(early.perInvite)} <Ticker />
            </span>{" "}
            to yours, up to {early.maxInvites}. They get their own {fmt(early.base)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <code className="min-w-0 flex-[1_1_240px] select-all truncate rounded-input border border-line bg-void px-3 py-2.5 font-pixel text-sm">{inviteUrl(st.handle)}</code>
          <button type="button" onClick={() => void copyLink()} className="btn-ceramic h-10 px-4 text-xs">
            Copy link
          </button>
          <button type="button" onClick={() => quoteOnX(card.current, st, onToast)} className="btn-line h-10 gap-2 px-4 text-xs">
            <XGlyph size={10} /> Post on X ↗
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] font-pixel text-xs tabular-nums">
            <thead className="text-left text-muted">
              <tr>
                <th className="pb-2 pr-3 font-normal">Friend</th>
                <th className="pb-2 pr-3 font-normal">Progress</th>
                <th className="pb-2 text-right font-normal">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {st.invites.length === 0 ? (
                <tr>
                  <td colSpan={3} className="border-t border-line py-3 font-sans text-sm text-muted">
                    No one yet. Share your link and they show up here as they go.
                  </td>
                </tr>
              ) : (
                st.invites.map((f) => {
                  const counts = f.step === 4 && paid++ < early.maxInvites;
                  return (
                    <tr key={f.handle} className="border-t border-line">
                      <td className="py-2.5 pr-3">@{f.handle}</td>
                      <td className="py-2.5 pr-3">
                        <span className="mr-2.5 inline-flex gap-[3px] align-middle">
                          {STEPS.map((_, i) => (
                            <i key={i} className={`block h-2 w-2 ${i <= f.step ? "bg-ceramic" : "bg-line-hover"}`} />
                          ))}
                        </span>
                        {STEPS[f.step]}
                      </td>
                      <td className="py-2.5 text-right">{f.step === 4 ? (counts ? `+${fmt(early.perInvite)}` : "over the cap") : "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
