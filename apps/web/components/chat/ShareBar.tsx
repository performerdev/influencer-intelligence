"use client";

import { useState } from "react";

import { useAuth } from "@/components/account/AuthProvider";

import { Sheet } from "./bits";

type Share = { id: string; url: string };

const clip = (s: string, n: number) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n).join("").trimEnd()}…` : s);

function intentUrl(share: Share, handle: string, question: string | null) {
  // the person's name without "@": sharing shouldn't ping them
  const text = question ? `asked ${handle}'s AI brain: “${clip(question.replace(/\s+/g, " "), 100)}”` : `${handle}'s AI brain, built from every public post`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(share.url)}`;
}

async function makeShare(messageId: string): Promise<Share> {
  const r = await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Couldn't create the link.");
  return j;
}

/**
 * Under every answer: share it as a card. With `offer`, it also invites the
 * user to post it on X for a free 2-hour session (once a day).
 */
export function ShareBar({ messageId, handle, question, offer }: { messageId: string; handle: string; question: string | null; offer?: boolean }) {
  const { refresh } = useAuth();
  const [share, setShare] = useState<Share | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [offerState, setOfferState] = useState<"idle" | "posted" | "claiming" | "done">("idle");

  const ensure = async () => {
    if (share) return share;
    const s = await makeShare(messageId);
    setShare(s);
    return s;
  };

  const openSheet = async () => {
    setMsg(null);
    try {
      await ensure();
      setOpen(true);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const postOnX = async (fromOffer = false) => {
    setMsg(null);
    // open the window first (popup blockers), then point it at the intent
    const w = window.open("", "_blank");
    try {
      const s = await ensure();
      const url = intentUrl(s, handle, question);
      if (w) w.location.href = url;
      else window.location.href = url;
      if (fromOffer) setOfferState("posted");
    } catch (e) {
      w?.close();
      setMsg((e as Error).message);
    }
  };

  const claim = async () => {
    if (!share) return;
    setOfferState("claiming");
    setMsg(null);
    const r = await fetch("/api/share/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shareId: share.id }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) {
      setOfferState("done");
      refresh();
    } else {
      setOfferState("posted");
      setMsg(j.error ?? "Couldn't add the session. Try again.");
    }
  };

  const copy = async () => {
    const s = await ensure().catch(() => null);
    if (!s) return;
    await navigator.clipboard?.writeText(s.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <button onClick={openSheet} className="link-quiet ml-1 text-xs" aria-haspopup="dialog">
        Share <span className="arrow">↗</span>
      </button>

      {offer && offerState !== "done" && (
        <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-panel px-4 py-3">
          <p className="font-pixel text-xs text-particle">
            {offerState === "idle" ? "Post this answer on X — get a free 2-hour session." : "Posted it? Claim your free 2-hour session."}
          </p>
          {offerState === "idle" ? (
            <button onClick={() => postOnX(true)} className="btn-ceramic h-8 px-3 text-xs">
              Post on X
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => postOnX(true)} className="link-quiet text-xs">
                Open X again
              </button>
              <button onClick={claim} disabled={offerState === "claiming"} className="btn-ceramic h-8 px-3 text-xs">
                {offerState === "claiming" ? "Checking…" : "Claim session"}
              </button>
            </div>
          )}
        </div>
      )}
      {offer && offerState === "done" && <p className="mt-3 w-full font-pixel text-xs text-ceramic">Free 2-hour session added. Thanks for sharing.</p>}
      {msg && <p className="mt-2 w-full text-xs text-particle">{msg}</p>}

      <Sheet open={open} onClose={() => setOpen(false)} title="Share this answer" side="bottom">
        {share && (
          <div className="mx-auto max-w-[640px] space-y-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/s/${share.id}/opengraph-image`} alt="Share card" width={1200} height={630} className="h-auto w-full rounded-panel border border-line" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => postOnX(false)} className="btn-ceramic">
                Post on X
              </button>
              <button onClick={copy} className="btn-line">
                {copied ? "Copied" : "Copy link"}
              </button>
              <a href={`/s/${share.id}/opengraph-image`} download={`${handle}-brain-${share.id}.png`} className="btn-line">
                Save image
              </a>
            </div>
            <p className="break-all font-mono text-xs text-muted">{share.url}</p>
          </div>
        )}
      </Sheet>
    </>
  );
}
