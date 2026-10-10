"use client";

import { forwardRef, useState } from "react";

import { ParticleSignature } from "@/components/particles/ParticleSignature";
import { AppLink } from "@/components/ui/AppLink";
import { formatCount, type Intelligence } from "@/lib/intelligences";

export const SIGNATURE_PX = 80;

type Props = {
  intelligences: Intelligence[];
  /** latest real questions asked on the site; the marquee hides when empty */
  questions?: { q: string; code: string }[];
  /** card signature boxes, in order — the hero clusters land on these */
  slotRef: (index: number, el: HTMLDivElement | null) => void;
  gridRef: React.Ref<HTMLUListElement>;
};

/** Screen 2 — the 10 intelligences. */
export const IntelligencesSection = forwardRef<HTMLElement, Props>(function IntelligencesSection(
  { intelligences, questions = [], slotRef, gridRef },
  ref,
) {
  return (
    <section
      ref={ref}
      id="intelligences"
      aria-labelledby="intelligences-title"
      className="relative z-10 mx-auto max-w-site px-gutter pb-32 pt-[34vh]"
    >
      <div className="flex items-end justify-between gap-6">
        <h2 id="intelligences-title" className="text-h2 font-medium">
          The intelligences
        </h2>
        <p className="shrink-0 pb-1 font-mono text-xs text-muted">
          <span className="text-particle">{intelligences.length} online</span>
          <span className="px-2">·</span>
          <AppLink href="/add" className="rounded-chip text-particle transition-colors duration-fast hover:text-ceramic">
            +Add
          </AppLink>
        </p>
      </div>
      {questions.length > 0 && <Marquee items={questions} />}

      <ul ref={gridRef} className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2 min-[1120px]:grid-cols-5">
        {intelligences.map((it, i) => (
          <Card key={it.code} it={it} slotRef={(el) => slotRef(i, el)} />
        ))}
      </ul>
    </section>
  );
});

function Card({ it, slotRef }: { it: Intelligence; slotRef: (el: HTMLDivElement | null) => void }) {
  const [active, setActive] = useState(false);
  return (
    <li>
      <AppLink
        href={`/i/${it.handle}`}
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        className="group flex h-full flex-col rounded-card border border-line bg-panel p-5 transition-[border-color,transform] duration-fast ease-ii-out hover:border-line-hover active:scale-[0.98]"
      >
        <div ref={slotRef} className="-ml-2 -mt-1" style={{ width: SIGNATURE_PX, height: SIGNATURE_PX }}>
          <ParticleSignature
            handle={it.handle}
            postsParsed={it.postsParsed}
            postsPerDay={it.postsPerDay}
            size={SIGNATURE_PX}
            active={active}
            style={{ opacity: "var(--sig-o, 1)" }}
          />
        </div>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="font-mono text-xs text-muted">{it.code}</span>
          <span className="truncate font-pixel text-body text-ceramic">@{it.handle}</span>
        </div>
        <p className={`mt-2 line-clamp-2 min-h-[3em] text-sm ${it.oneLineMind ? "text-particle" : "text-muted"}`}>
          {it.oneLineMind ?? "Brain not distilled yet."}
        </p>

        <div className="mt-auto flex items-center justify-between pt-6">
          <span className="font-mono text-xs text-muted">
            <span className="text-particle">{formatCount(it.postsParsed)}</span> posts
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-ceramic">
            Talk
            <span aria-hidden className="transition-transform duration-fast ease-ii-out group-hover:translate-x-1">
              →
            </span>
          </span>
        </div>
      </AppLink>
    </li>
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
    <div className="relative mt-6 overflow-hidden border-y border-line py-3" aria-label="Latest questions">
      <div className="marquee-track flex w-max">
        {row}
        <span aria-hidden className="flex">{row}</span>
      </div>
    </div>
  );
}
