"use client";

import { forwardRef, useState } from "react";

import { AddBrain } from "@/components/particles/AddBrain";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { formatCount, type Intelligence } from "@/lib/intelligences";

export const SIGNATURE_PX = 80;

type Props = {
  intelligences: Intelligence[];
  /** latest real questions asked on the site; the marquee hides when empty */
  questions?: { q: string; code: string }[];
};

/** The minds, then a card to add one more. Cards rise in quietly as they scroll into view (`reveal`). */
export const IntelligencesSection = forwardRef<HTMLElement, Props>(function IntelligencesSection({ intelligences, questions = [] }, ref) {
  const colors = intelligences.map((i) => i.color);
  return (
    <section ref={ref} id="intelligences" aria-labelledby="intelligences-title" className="relative z-10 mx-auto max-w-site scroll-mt-20 px-gutter pt-8">
      <div className="reveal flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <h2 id="intelligences-title" className="text-h2 font-medium">
            The minds
          </h2>
          <p className="mt-3 max-w-[52ch] text-body text-particle">
            AI versions of well-known crypto traders and builders. Each one answers the way that person would. Pick one to start a chat.
          </p>
        </div>
        <p className="shrink-0 pb-1 font-mono text-xs text-particle">{intelligences.length} online</p>
      </div>
      {questions.length > 0 && <Marquee items={questions} />}

      <ul className="mt-8 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-3 min-[1080px]:grid-cols-4">
        {intelligences.map((it) => (
          <Card key={it.code} it={it} />
        ))}
        <AddCard colors={colors} />
      </ul>
    </section>
  );
});

function Card({ it }: { it: Intelligence }) {
  const [active, setActive] = useState(false);
  const on = () => setActive(true);
  const off = () => setActive(false);
  return (
    <li className="reveal">
      <AppLink
        href={`/i/${it.handle}`}
        onPointerEnter={on}
        onPointerLeave={off}
        onFocus={on}
        onBlur={off}
        className="group flex h-full flex-col rounded-card border border-line bg-panel p-4 transition-[border-color,transform] duration-fast ease-ii-out hover:border-[var(--brain)] active:scale-[0.98] sm:p-5"
        style={{ "--brain": `color-mix(in srgb, ${it.color} 55%, transparent)` } as React.CSSProperties}
      >
        <div className="-ml-2 -mt-1 mb-4 sm:mb-5">
          <span className="sm:hidden">
            <BrainAvatar it={it} size={64} active={active} />
          </span>
          <span className="hidden sm:block">
            <BrainAvatar it={it} size={80} active={active} />
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-xs" style={{ color: it.color }}>
            {it.code}
          </span>
          <span className="truncate font-pixel text-body text-ceramic">@{it.handle}</span>
        </div>
        <p className={`mt-2 line-clamp-2 min-h-[3em] text-sm ${it.oneLineMind ? "text-particle" : "text-muted"}`}>{it.oneLineMind ?? "Brain not distilled yet."}</p>
        <div className="mt-auto flex items-center justify-between pt-6">
          <span className="font-mono text-xs text-muted">
            <span className="text-particle">{formatCount(it.postsParsed)}</span> posts read
          </span>
          <Go label="Talk" />
        </div>
      </AppLink>
    </li>
  );
}

function AddCard({ colors }: { colors: string[] }) {
  const [active, setActive] = useState(false);
  const on = () => setActive(true);
  const off = () => setActive(false);
  return (
    <li className="reveal">
      <AppLink
        href="/add"
        onPointerEnter={on}
        onPointerLeave={off}
        onFocus={on}
        onBlur={off}
        className="group flex h-full flex-col rounded-card border border-dashed border-line p-4 transition-[border-color,transform] duration-fast ease-ii-out hover:border-line-hover active:scale-[0.98] sm:p-5"
      >
        <div className="-ml-2 -mt-1 mb-4 sm:mb-5">
          <span className="sm:hidden">
            <AddBrain size={64} colors={colors} active={active} />
          </span>
          <span className="hidden sm:block">
            <AddBrain size={80} colors={colors} active={active} />
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-xs text-muted">+</span>
          <span className="truncate font-pixel text-body text-ceramic">Add a mind</span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-[3em] text-sm text-particle">Missing someone? Add any account on X. It goes live here once it&apos;s built.</p>
        <div className="mt-auto flex items-center justify-between pt-6">
          <span className="font-mono text-xs text-muted">
            from <span className="text-particle">2 USDC</span>
          </span>
          <Go label="Add" />
        </div>
      </AppLink>
    </li>
  );
}

function Go({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ceramic">
      {label}
      <span aria-hidden className="transition-transform duration-fast ease-ii-out group-hover:translate-x-1">
        →
      </span>
    </span>
  );
}

/** One slow marquee: real questions people asked, and which intelligence answered. Never faked. */
function Marquee({ items }: { items: { q: string; code: string }[] }) {
  const row = items.map((it, i) => (
    <span key={i} className="mx-6 shrink-0 font-mono text-xs text-muted">
      <span className="text-particle">&ldquo;{it.q}&rdquo;</span> → {it.code}
    </span>
  ));
  return (
    <div className="reveal relative mt-6 overflow-hidden border-y border-line py-3" aria-label="Latest questions">
      <div className="marquee-track flex w-max">
        {row}
        <span aria-hidden className="flex">
          {row}
        </span>
      </div>
    </div>
  );
}
