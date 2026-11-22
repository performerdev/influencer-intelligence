"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Ticker } from "@/components/early/Ticker";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { community } from "@/config/community";
import type { Intelligence } from "@/lib/intelligences";

type Built = Intelligence & { people: number; earned: number };
const fmt = (n: number) => n.toLocaleString("en-US");

/** /account: the minds you added, the people they've answered, the $ii that earned you. */
export function YourMinds({ minds, handle, showAddedBy, earlyDone }: { minds: Built[]; handle: string; showAddedBy: boolean; earlyDone: boolean }) {
  const total = minds.reduce((s, m) => s + m.earned, 0);
  return (
    <section id="your-minds" className="mt-16 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h2 className="text-h3">Your minds</h2>
        {minds.length > 0 && <AddedByToggle handle={handle} initial={showAddedBy} />}
      </div>
      <p className="mt-3 max-w-[62ch] text-sm text-particle">
        Every person who talks to a mind you added gets you{" "}
        <span className="font-pixel text-ceramic">
          +{community.perPerson} <Ticker />
        </span>
        , up to {fmt(community.capPerMind)} per mind. A person counts once, logged in with X, with an account older than {community.minAccountDays} days.
      </p>

      {minds.length === 0 ? (
        <AppLink href="/add" className="mt-5 flex items-center justify-between gap-4 rounded-panel border border-dashed border-line px-4 py-4 transition-colors duration-fast hover:border-line-hover">
          <span className="text-sm text-particle">You haven&apos;t added a mind yet. Anyone on X, from 2 USDC.</span>
          <span className="shrink-0 font-pixel text-sm text-ceramic">+ Add a mind →</span>
        </AppLink>
      ) : (
        <>
          <ul className="mt-5 divide-y divide-line rounded-panel border border-line bg-panel">
            {minds.map((m) => {
              const share = Math.min(1, m.earned / community.capPerMind);
              return (
                <li key={m.code} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
                  <BrainAvatar it={m} size={40} />
                  <div className="min-w-0">
                    <AppLink href={`/i/${m.handle}`} className="flex items-baseline gap-2 hover:text-ceramic">
                      <span className="font-mono text-xs" style={{ color: m.color }}>
                        {m.code}
                      </span>
                      <span className="truncate font-pixel text-body text-ceramic">@{m.handle}</span>
                    </AppLink>
                    <p className="mt-0.5 font-pixel text-[11px] text-muted">{m.tier === "community" ? "Community" : "Main list"} · {m.distilledAt ? `${fmt(m.people)} ${m.people === 1 ? "person" : "people"}` : "building"}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1 sm:w-[220px]">
                    <p className="flex items-baseline justify-between gap-3 font-pixel text-sm">
                      <span className="text-ceramic tabular-nums">
                        +{fmt(m.earned)} <Ticker />
                      </span>
                      <span className="text-[11px] text-muted tabular-nums">of {fmt(community.capPerMind)}</span>
                    </p>
                    <div className="mt-2 h-[3px] w-full bg-line" aria-hidden>
                      <div className="h-full" style={{ width: `${share * 100}%`, background: m.color }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-pixel text-xs text-muted">
            <span>
              Total <span className="text-ceramic">+{fmt(total)}</span> <Ticker /> · added to your Early allocation
            </span>
            {earlyDone ? (
              <AppLink href="/early" className="link-quiet">
                Your allocation <span className="arrow">↗</span>
              </AppLink>
            ) : (
              <AppLink href="/early" className="text-ceramic underline decoration-line-hover underline-offset-4">
                Finish Early to lock it in →
              </AppLink>
            )}
          </p>
        </>
      )}
    </section>
  );
}

function AddedByToggle({ handle, initial }: { handle: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const flip = async (next: boolean) => {
    setOn(next);
    setBusy(true);
    const r = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showAddedBy: next }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) setOn(!next);
    else router.refresh();
  };
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-particle">
      <input type="checkbox" checked={on} disabled={busy} onChange={(e) => void flip(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-5 w-9 rounded-pill border border-line bg-panel transition-colors duration-fast peer-checked:border-ceramic peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-ceramic">
        <span className={`absolute top-[3px] h-3 w-3 bg-ceramic transition-[left] duration-fast ${on ? "left-[19px]" : "left-[3px]"}`} />
      </span>
      Show &ldquo;added by @{handle}&rdquo;
    </label>
  );
}
