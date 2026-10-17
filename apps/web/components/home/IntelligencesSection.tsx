"use client";

import { forwardRef } from "react";

import { AppLink } from "@/components/ui/AppLink";
import { formatCount, type Intelligence } from "@/lib/intelligences";

export const SIGNATURE_PX = 80;

type Props = {
  intelligences: Intelligence[];
  /** latest real questions asked on the site; the marquee hides when empty */
  questions?: { q: string; code: string }[];
  gridRef: React.Ref<HTMLUListElement>;
};

/**
 * Screen 2: the intelligences, then a card to add one more. Each card's pixel
 * brain is drawn by the home stage (ii-stage.ts) into its `.brain-slot`
 * canvas; the copy (`data-c`) dithers in when that brain's squares land.
 */
export const IntelligencesSection = forwardRef<HTMLElement, Props>(function IntelligencesSection({ intelligences, questions = [], gridRef }, ref) {
  const n = intelligences.length;
  return (
    <section ref={ref} id="intelligences" aria-labelledby="intelligences-title" className="relative z-10 mx-auto max-w-site px-gutter pb-32 pt-[34vh]">
      <div className="dither dither-pre flex items-end justify-between gap-6" data-d="head">
        <h2 id="intelligences-title" className="text-h2 font-medium">
          The intelligences
        </h2>
        <p className="shrink-0 pb-1 font-mono text-xs text-particle">{n} online</p>
      </div>
      {questions.length > 0 && <Marquee items={questions} />}

      <ul ref={gridRef} className="mt-8 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-3 min-[1080px]:grid-cols-4">
        {intelligences.map((it, i) => (
          <li key={it.code}>
            <AppLink
              href={`/i/${it.handle}`}
              data-card
              className="group flex h-full flex-col rounded-card border border-line bg-panel p-4 transition-[border-color,transform] duration-fast ease-ii-out hover:border-[var(--brain)] active:scale-[0.98] sm:p-5"
              style={{ "--brain": `color-mix(in srgb, ${it.color} 55%, transparent)` } as React.CSSProperties}
            >
              <BrainSlot />
              <div className="dither dither-pre" data-c={i}>
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 font-mono text-xs" style={{ color: it.color }}>
                    {it.code}
                  </span>
                  <span className="truncate font-pixel text-body text-ceramic">@{it.handle}</span>
                </div>
                <p className={`mt-2 line-clamp-2 min-h-[3em] text-sm ${it.oneLineMind ? "text-particle" : "text-muted"}`}>{it.oneLineMind ?? "Brain not distilled yet."}</p>
              </div>
              <div className="dither dither-pre mt-auto flex items-center justify-between pt-6" data-c={i}>
                <span className="font-mono text-xs text-muted">
                  <span className="text-particle">{formatCount(it.postsParsed)}</span> posts
                </span>
                <TalkArrow label="Talk" />
              </div>
            </AppLink>
          </li>
        ))}
        <li>
          <AppLink
            href="/add"
            data-card
            className="group flex h-full flex-col rounded-card border border-dashed border-line p-4 transition-[border-color,transform] duration-fast ease-ii-out hover:border-line-hover active:scale-[0.98] sm:p-5"
          >
            <BrainSlot />
            <div className="dither dither-pre" data-c={n}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-muted">+</span>
                <span className="truncate font-pixel text-body text-ceramic">Add a mind</span>
              </div>
              <p className="mt-2 line-clamp-2 min-h-[3em] text-sm text-particle">Any account on X. Built from every public post, live here when it&apos;s done.</p>
            </div>
            <div className="dither dither-pre mt-auto flex items-center justify-between pt-6" data-c={n}>
              <span className="font-mono text-xs text-muted">
                from <span className="text-particle">2 USDC</span>
              </span>
              <TalkArrow label="Add" />
            </div>
          </AppLink>
        </li>
      </ul>
    </section>
  );
});

function BrainSlot() {
  return (
    <div className="brain-slot -ml-2 -mt-1 mb-4 h-16 w-16 sm:mb-5 sm:h-20 sm:w-20" aria-hidden>
      <canvas className="block h-full w-full" />
    </div>
  );
}

function TalkArrow({ label }: { label: string }) {
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
    <div className="relative mt-6 overflow-hidden border-y border-line py-3" aria-label="Latest questions">
      <div className="marquee-track flex w-max">
        {row}
        <span aria-hidden className="flex">
          {row}
        </span>
      </div>
    </div>
  );
}
