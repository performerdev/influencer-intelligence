"use client";

import { useEffect } from "react";

import { scrollToTarget } from "@/components/layout/SmoothScroll";

/** "#section" links on a docs page glide to the heading (under the top bar) instead of jumping. */
export function DocAnchors() {
  useEffect(() => {
    const top = () => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ii-topbar-h")) || 64) + 24;
    const go = (id: string) => {
      const el = document.getElementById(decodeURIComponent(id));
      if (!el) return false;
      scrollToTarget(Math.max(0, el.getBoundingClientRect().top + window.scrollY - top()));
      return true;
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const id = a.getAttribute("href")!.slice(1);
      if (id && go(id)) {
        e.preventDefault();
        history.replaceState(null, "", `#${id}`);
      }
    };
    document.addEventListener("click", onClick);
    // arriving with a #section in the address (a link from another docs page)
    if (location.hash) setTimeout(() => go(location.hash.slice(1)), 60);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
