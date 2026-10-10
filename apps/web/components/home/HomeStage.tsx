"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Hero } from "@/components/hero/Hero";
import { heroStore, whenHeroReady } from "@/components/hero/hero-store";
import { PRELOADER_POINT_PX, Preloader } from "@/components/hero/Preloader";
import { getLenis, scrollToTarget } from "@/components/layout/SmoothScroll";
import type { Intelligence } from "@/lib/intelligences";
import { signatureDensity, signatureSpeed } from "@/lib/signature";
import { ease, heroTimeline } from "@/lib/tokens";

import { IntelligencesSection } from "./IntelligencesSection";

gsap.registerPlugin(ScrollTrigger);

const HeroScene = lazy(() => import("@/components/hero/HeroScene"));

/** The intro plays once per page load; client-side returns to "/" skip it. */
let introPlayed = false;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Home screens 1–2 as one continuous stage: the fixed WebGL canvas holds the
 * "ii" while the page scrolls, then hands each of its 10 clusters to a card.
 */
export function HomeStage({ intelligences, questions = [] }: { intelligences: Intelligence[]; questions?: { q: string; code: string }[] }) {
  const handles = useMemo(() => intelligences.map((i) => i.handle), [intelligences]);
  const [mode, setMode] = useState<"pending" | "motion" | "reduced" | "static">("pending");

  const heroRef = useRef<HTMLElement>(null);
  const logoSlotRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const preloaderRef = useRef<HTMLDivElement>(null);
  const scatterEnd = useRef<number | null>(null);

  // Card signature boxes → landing slots.
  const setSlot = useCallback(
    (i: number, el: HTMLDivElement | null) => {
      const it = intelligences[i];
      heroStore.slots[i] = el
        ? { el, handle: it.handle, speed: signatureSpeed(it.postsPerDay), density: signatureDensity(it.postsParsed) }
        : null;
    },
    [intelligences],
  );

  useEffect(() => {
    heroStore.logoSlot = logoSlotRef.current;
    const webgl = hasWebGL();
    // No WebGL → the static SVG mark, same as reduced motion for everything else.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !webgl;
    heroStore.reducedMotion = reduced;
    setMode(!webgl ? "static" : reduced ? "reduced" : "motion");

    const hero = heroRef.current!;
    const words = hero.querySelectorAll<HTMLElement>(".hero-word");
    const follow = Array.from(hero.querySelectorAll<HTMLElement>(".hero-follow")).sort(
      (a, b) => Number(a.dataset.step) - Number(b.dataset.step),
    );
    const pre = preloaderRef.current!;
    const part = (n: string) => pre.querySelector<HTMLElement>(`[data-part="${n}"]`)!;

    const settle = () => {
      Object.assign(heroStore, { dot: 1, stem: 1, rise: 0, copy: 1, breath: reduced ? 0 : 1, repel: reduced ? 0 : 1 });
      gsap.set(words, { y: 0, yPercent: 0 });
      gsap.set(follow, { opacity: 1, y: 0 });
      gsap.set(pre, { display: "none" });
    };

    // ?slow=4 plays the intro 4× slower — handy for design review and README capture.
    const slow = Number(new URLSearchParams(location.search).get("slow"));
    if (slow > 1) gsap.globalTimeline.timeScale(1 / slow);

    const ctx = gsap.context(() => {
      if (reduced) {
        settle();
        gsap.fromTo(hero, { opacity: 0 }, { opacity: 1, duration: 0.4 });
        return;
      }
      if (introPlayed) {
        settle();
        return;
      }
      introPlayed = true;
      playIntro({ words, follow, pre, part });
    });

    // Scroll: the particle "i" splits into 10 clusters that land on the cards.
    let st: ScrollTrigger | undefined;
    if (!reduced) {
      st = ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        endTrigger: gridRef.current!,
        end: "top 22%",
        scrub: true,
        onRefresh: (self) => (scatterEnd.current = self.end),
        onUpdate: (self) => applyScatter(self.progress),
      });
      applyScatter(st.progress);
    }

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "mouse") heroStore.pointer = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => (heroStore.pointer = null);
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      heroStore.tilt.x = gsap.utils.clamp(-0.06, 0.06, ((e.beta - 45) / 45) * 0.06);
      heroStore.tilt.y = gsap.utils.clamp(-0.06, 0.06, (e.gamma / 45) * 0.06);
    };
    if (!reduced) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      // Only listens; never prompts. iOS stays still unless permission was granted elsewhere.
      window.addEventListener("deviceorientation", onTilt, { passive: true });
    }

    return () => {
      ctx.revert();
      st?.kill();
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("deviceorientation", onTilt);
      unlockScroll();
    };

    function applyScatter(p: number) {
      heroStore.scatter = p;
      // crossfade: the canvas lets go just as each card's own canvas takes over
      const h = smooth(0.93, 0.995, p);
      if (canvasWrapRef.current) {
        canvasWrapRef.current.style.opacity = String(1 - h);
        canvasWrapRef.current.style.visibility = h >= 1 ? "hidden" : "visible";
      }
      sectionRef.current?.style.setProperty("--sig-o", String(h));
      // gone before it can slide under the pinned mark
      hero.style.setProperty("--hero-fade", String(1 - smooth(0.0, 0.075, p)));
    }
  }, []);

  function playIntro({
    words,
    follow,
    pre,
    part,
  }: {
    words: NodeListOf<HTMLElement>;
    follow: HTMLElement[];
    pre: HTMLElement;
    part: (n: string) => HTMLElement;
  }) {
    lockScroll();
    Object.assign(heroStore, { dot: 0, stem: 0, rise: 1, copy: 0, breath: 0, repel: 0 });
    // y: 0 clears the CSS pre-state so only yPercent drives the mask reveal
    gsap.set(words, { y: 0, yPercent: 105 });
    gsap.set(follow, { opacity: 0, y: 10 });

    const line = part("line");
    const point = part("point");
    const s0 = 4 / PRELOADER_POINT_PX; // the 4px point

    // Act 0 — preloader: draw the line, contract it to a point.
    const pre1 = gsap.timeline();
    pre1
      .set(line, { transformOrigin: "0% 50%", scaleX: 0 })
      .to(line, { scaleX: 1, duration: heroTimeline.preloaderLine, ease: ease.inOut })
      .set(line, { transformOrigin: "50% 50%" })
      .to(line, { scaleX: 0.008, duration: heroTimeline.preloaderContract, ease: "power3.in" })
      .set(point, {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        xPercent: -50,
        yPercent: -50,
        scale: s0,
        opacity: 1,
      })
      .set(line, { opacity: 0 })
      .add(() => {
        // Never hang on a black screen: if WebGL is slow to boot, go on without it.
        let started = false;
        const once = () => {
          if (started) return;
          started = true;
          clearTimeout(fallback);
          act1();
        };
        const fallback = setTimeout(once, 2500);
        whenHeroReady(once);
      });

    // Act 1 — the point becomes the dot, the solid "i" rises, the copy runs.
    function act1() {
      const d = heroStore.dotScreen ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, r: 30 };
      const T0 = 0.5;
      const tl = gsap.timeline({ onComplete: unlockScroll });
      tl.to(point, { x: d.x, y: d.y, scale: (d.r * 2) / PRELOADER_POINT_PX, duration: T0, ease: "power3.inOut" })
        // 0.0–0.6 solid "i" rises 12px and settles
        .to(heroStore, { dot: 1, duration: 0.16, ease: "none" }, T0)
        .to(point, { opacity: 0, duration: 0.22, ease: "none" }, T0 + 0.08)
        .to(part("bg"), { opacity: 0, duration: 0.35, ease: "none" }, T0)
        .to(heroStore, { stem: 1, duration: 0.45, ease: "power2.out" }, T0)
        .to(heroStore, { rise: 0, duration: heroTimeline.solidRise, ease: ease.out }, T0)
        .set(pre, { display: "none" }, T0 + 0.4)
        // 0.6–2.2 the copy: points stream out of the solid "i" (per-point expo.out in the shader)
        .to(heroStore, { copy: 1, duration: heroTimeline.copyEnd - heroTimeline.copyStart, ease: "none" }, T0 + heroTimeline.copyStart)
        .to(heroStore, { breath: 1, duration: 1.2, ease: "none" }, T0 + heroTimeline.copyEnd - 0.4)
        .set(heroStore, { repel: 1 }, T0 + heroTimeline.copyEnd)
        // 2.2–2.9 headline, word by word, then subtitle and actions
        .to(words, { yPercent: 0, duration: 0.5, stagger: heroTimeline.headlineWordStagger, ease: ease.outStrong }, T0 + heroTimeline.headlineStart)
        .to(follow, { opacity: 1, y: 0, duration: 0.6, stagger: heroTimeline.followOffset, ease: ease.out }, T0 + heroTimeline.headlineStart + 0.45)
        .add(unlockScroll, T0 + heroTimeline.copyEnd);
    }
  }

  const onPick = useCallback(() => {
    // Scrolling to the end of the scatter plays the whole transition into the cards.
    if (scatterEnd.current != null) scrollToTarget(scatterEnd.current);
    else scrollToTarget("#intelligences");
  }, []);

  return (
    <>
      <Preloader ref={preloaderRef} />
      <div
        ref={canvasWrapRef}
        aria-hidden
        className={
          mode === "reduced"
            ? "pointer-events-none absolute inset-x-0 top-0 z-20 h-[100svh] min-h-[600px]"
            : "pointer-events-none fixed inset-0 z-30"
        }
      >
        {(mode === "motion" || mode === "reduced") && (
          <Suspense fallback={null}>
            <HeroScene handles={handles} />
          </Suspense>
        )}
      </div>
      <Hero ref={heroRef} logoSlotRef={logoSlotRef} onPick={onPick} staticLogo={mode === "static"} />
      <IntelligencesSection ref={sectionRef} gridRef={gridRef} intelligences={intelligences} questions={questions} slotRef={setSlot} />
    </>
  );
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function lockScroll() {
  history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  document.documentElement.style.overflow = "hidden";
  requestAnimationFrame(() => getLenis()?.stop());
}

function unlockScroll() {
  document.documentElement.style.overflow = "";
  getLenis()?.start();
}
