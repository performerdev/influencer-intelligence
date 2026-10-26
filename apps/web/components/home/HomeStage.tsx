"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { XGlyph } from "@/components/account/AuthProvider";
import { Hero } from "@/components/hero/Hero";
import { startIiStage } from "@/components/hero/ii-stage";
import { scrollToTarget } from "@/components/layout/SmoothScroll";
import type { Intelligence } from "@/lib/intelligences";

import { IntelligencesSection } from "./IntelligencesSection";

/** The intro plays once per page load; client-side returns to "/" skip it. */
let introPlayed = false;

const POINTS = [
  {
    title: "Built from their real posts",
    body: "We read every public post the person wrote and pull out how they think, what they buy and sell, and how they talk. Under any answer you can open the exact brain the AI was given.",
  },
  {
    title: "Talk to anyone",
    body: "Ask a mind anything, one on one. Or put two to four of them in a group chat and let them argue it out.",
  },
  {
    title: "Every call, checked",
    body: "Each coin they called is priced a day, a week and a month later. Code does the math, not the AI, so you can see who was actually right.",
  },
];

/**
 * The home page for visitors: the "ii" and headline, the minds, how it works.
 * Logged-in visitors get the app on "/" instead (see app/page.tsx).
 */
export function HomeStage({ intelligences, questions = [] }: { intelligences: Intelligence[]; questions?: { q: string; code: string }[] }) {
  const [staticLogo, setStaticLogo] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iiBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setStaticLogo(true);
    const stop = canvasRef.current
      ? startIiStage({
          canvas: canvasRef.current,
          root,
          iiBox: iiBoxRef.current!,
          colors: intelligences.map((i) => i.color),
          skipIntro: introPlayed,
          still: reduced,
          onStill: () => setStaticLogo(true),
        })
      : () => {};
    introPlayed = true;

    // quiet reveal: what starts below the fold rises in once, as it scrolls into view
    const els = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    let io: IntersectionObserver | null = null;
    if (!reduced) {
      io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add("reveal-in");
            io?.unobserve(e.target);
          }),
        { rootMargin: "0px 0px -8% 0px" },
      );
      let k = 0;
      for (const el of els) {
        if (el.getBoundingClientRect().top < window.innerHeight) continue;
        el.style.transitionDelay = `${(k++ % 4) * 60}ms`;
        el.classList.add("reveal-pre");
        io.observe(el);
      }
    }
    return () => {
      stop();
      io?.disconnect();
    };
  }, [intelligences]);

  const onPick = useCallback(() => scrollToTarget("#intelligences"), []);

  return (
    <div ref={rootRef}>
      <Hero iiBoxRef={iiBoxRef} canvasRef={canvasRef} onPick={onPick} staticLogo={staticLogo} />
      <IntelligencesSection intelligences={intelligences} questions={questions} />

      <section aria-labelledby="how-title" className="mx-auto max-w-site px-gutter pt-[clamp(80px,12vh,128px)]">
        <div className="reveal">
          <h2 id="how-title" className="text-h2 font-medium">
            How it works
          </h2>
          <p className="mt-3 max-w-[52ch] text-body text-particle">Not a chatbot playing a character. Every mind is made from the person&apos;s own words, and every number is checked.</p>
        </div>
        <ol className="mt-8 grid gap-3 md:grid-cols-3">
          {POINTS.map((p, i) => (
            <li key={p.title} className="reveal rounded-card border border-line bg-panel p-6">
              <span className="font-mono text-xs text-muted">0{i + 1}</span>
              <h3 className="mt-3 font-pixel text-h3">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-particle">{p.body}</p>
            </li>
          ))}
        </ol>

        <div className="reveal mt-[clamp(64px,10vh,112px)] flex flex-col items-start justify-between gap-6 border-t border-line pb-32 pt-10 md:flex-row md:items-center">
          <div>
            <p className="font-pixel text-h3">Keep your chats and see every call</p>
            <p className="mt-2 max-w-[56ch] text-sm text-particle">Log in with X and ii.plus opens as your workspace: all the minds in one place, your chat history, and each mind&apos;s full call record.</p>
          </div>
          <a href="/api/auth/x/login?next=/" className="btn-ceramic shrink-0 gap-2">
            <XGlyph /> Log in with X
          </a>
        </div>
      </section>
    </div>
  );
}
