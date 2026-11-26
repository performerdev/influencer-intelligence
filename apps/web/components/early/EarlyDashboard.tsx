"use client";

import { useRef, useState } from "react";

import { XGlyph } from "@/components/account/AuthProvider";
import { AppLink } from "@/components/ui/AppLink";
import { earlyCode } from "@/config/early";
import { brainColor } from "@/lib/colors";
import type { EarlyState } from "@/lib/server/early";

import { type CardHandle, EarlyCard } from "./EarlyCard";
import { RoleBadge } from "./RoleBadge";

const fmt = (n: number) => n.toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const STEPS = ["Logged in", "Wallet added", "1 of 3 tasks", "2 of 3 tasks", "On the list"];

/** Each spot's color: same lightness and chroma as the brains, hue stepped by number. */
export const earlyColor = (n: number) => brainColor(`early-${n}`);

export const inviteUrl = (handle: string) => `${typeof window !== "undefined" ? window.location.host : "ii.plus"}/e/${handle.toLowerCase()}`;

/** Copy the card, then open X with the text filled in and the launch post quoted. */
export function quoteOnX(card: CardHandle | null, s: EarlyState, flash: (t: string) => void) {
  if (s.number == null || !s.handle) return;
  const text = `On the ii waitlist. Spot ${earlyCode(s.number)}.\n\nEvery CT mind, now an AI → ${inviteUrl(s.handle)}`;
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

/** /waitlist once you're on it: your card, your spot and role, your invites. */
export function EarlyDashboard({ st, onState, onToast }: { st: EarlyState; onState: (s: EarlyState) => void; onToast: (t: string) => void }) {
  const card = useRef<CardHandle>(null);
  const [editing, setEditing] = useState(false);
  const [wallet, setWallet] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (st.number == null || !st.handle) return null;
  const color = earlyColor(st.number);
  const inviteCount = st.invites.filter((i) => i.step === 4).length;

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
    a.download = `ii-waitlist-${String(st.number).padStart(4, "0")}.png`;
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
          <h1 className="font-pixel text-h1">Waitlist</h1>
          <p className="mt-2 text-particle">You&apos;re on the list. First in line for what we ship next.</p>
        </div>
        <p className="font-pixel text-[11px] text-muted">{fmt(st.minds)} on the list</p>
      </div>

      <div className="mt-8 grid gap-3.5 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <figure className="grid min-w-0 gap-3 rounded-panel border border-line bg-panel p-4">
          <EarlyCard ref={card} handle={st.handle} number={st.number} color={color} joined={st.joinedAt} />
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

        <section aria-label="Your spot" className="min-w-0 rounded-panel border border-line bg-panel p-5">
          <p className="label-mono">Your spot</p>
          <div className="mb-5 mt-3 flex items-center gap-4">
            <RoleBadge size={64} color={color} />
            <div>
              <p className="font-pixel text-h1 leading-none" style={{ color }}>
                {earlyCode(st.number)}
              </p>
              <p className="mt-2 font-pixel text-[11px] text-particle">Role · Waitlist</p>
            </div>
          </div>
          <div className="font-pixel text-sm">
            <div className={row}>
              <span className="text-particle">Tasks</span>
              <span>3/3 ✓</span>
            </div>
            <div className={row}>
              <span className="text-particle">Friends in</span>
              <span className="tabular-nums">{fmt(inviteCount)}</span>
            </div>
            {(st.builder?.minds ?? 0) > 0 && (
              <div className={row}>
                <AppLink href="/account#your-minds" className="text-particle underline decoration-line-hover underline-offset-4 hover:text-ceramic">
                  Minds you added
                </AppLink>
                <span className="tabular-nums">{st.builder.minds}</span>
              </div>
            )}
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
          <p className="mt-4 text-xs text-muted">We check the follow, repost and reply again before doors open. Undo one and you lose the spot.</p>
        </section>
      </div>

      <section aria-label="Invites" className="mt-3.5 grid gap-4 rounded-panel border border-line bg-panel p-5">
        <div>
          <p className="label-mono">Invite friends</p>
          <p className="mt-2 text-sm text-particle">Everyone who gets in through your link is counted on your spot, and gets a spot of their own.</p>
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
                <th className="pb-2 text-right font-normal">Spot</th>
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
                      <td className="py-2.5 text-right">{f.step === 4 ? "In" : "—"}</td>
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
