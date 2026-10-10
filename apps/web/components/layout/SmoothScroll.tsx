"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect } from "react";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

/** The active Lenis instance (null with reduced motion). */
export const getLenis = () => lenis;

/** Smooth-scroll to a selector or y, falling back to native scrolling. */
export function scrollToTarget(target: string | number) {
  if (lenis) {
    lenis.scrollTo(target, { duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
    return;
  }
  const y = typeof target === "number" ? target : (document.querySelector(target) as HTMLElement | null)?.offsetTop ?? 0;
  window.scrollTo({ top: y });
}

/** Lenis smooth scroll driven by GSAP's ticker so ScrollTrigger stays in lockstep. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const l = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis = l;
    l.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => l.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      l.destroy();
      lenis = null;
    };
  }, []);
  return null;
}
