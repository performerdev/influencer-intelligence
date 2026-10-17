"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Hero } from "@/components/hero/Hero";
import { startIiStage } from "@/components/hero/ii-stage";
import { scrollToTarget } from "@/components/layout/SmoothScroll";
import type { Intelligence } from "@/lib/intelligences";

import { IntelligencesSection } from "./IntelligencesSection";

/** The intro plays once per page load; client-side returns to "/" skip it. */
let introPlayed = false;

// A reload should start at the hero, not wherever the page was left.
if (typeof window !== "undefined" && "scrollRestoration" in history) history.scrollRestoration = "manual";

/**
 * Home screens 1–2 as one stage: a fixed WebGL canvas holds the "ii" while the
 * page scrolls, then streams one colored band of it into each card's brain.
 */
export function HomeStage({ intelligences, questions = [] }: { intelligences: Intelligence[]; questions?: { q: string; code: string }[] }) {
  const [staticLogo, setStaticLogo] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iiBoxRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const grid = gridRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setStaticLogo(true);
    if (!introPlayed) window.scrollTo(0, 0);
    const stop = startIiStage({
      canvas: canvasRef.current!,
      root,
      iiBox: iiBoxRef.current!,
      grid,
      slots: Array.from(grid.querySelectorAll<HTMLElement>(".brain-slot")),
      cardEls: Array.from(grid.querySelectorAll<HTMLElement>("[data-card]")),
      cards: [...intelligences.map((it) => ({ color: it.color, avatar: it.avatar })), { color: "#969590", add: true }],
      skipIntro: introPlayed,
      still: reduced,
      onStill: () => setStaticLogo(true),
    });
    introPlayed = true;
    return stop;
  }, [intelligences]);

  const onPick = useCallback(() => {
    // the scroll position where every band has landed: the whole transition plays on the way
    const g = gridRef.current;
    if (!g) return scrollToTarget("#intelligences");
    const top = g.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.22;
    scrollToTarget(Math.min(top, document.documentElement.scrollHeight - window.innerHeight - 2));
  }, []);

  return (
    <div ref={rootRef}>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-30 h-full w-full" />
      <Hero iiBoxRef={iiBoxRef} onPick={onPick} staticLogo={staticLogo} />
      <IntelligencesSection gridRef={gridRef} intelligences={intelligences} questions={questions} />
    </div>
  );
}
