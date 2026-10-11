"use client";

import { useEffect } from "react";

/**
 * Pages like chat and group scroll inside a panel, not the window, and that
 * panel never has focus (the cursor lives in the input). This sends the
 * scroll keys — arrows (numpad too), Page Up/Down, Home/End, Space — to the
 * visible element marked [data-scroll-main]. While typing, only Page Up/Down
 * and arrows in an empty field scroll, so editing text is never hijacked.
 */
export function KeyboardScroll() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const keys = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "];
      if (!keys.includes(e.key)) return;

      const target = e.target as HTMLElement;
      const field = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (field) {
        const empty = "value" in target && !(target as HTMLInputElement).value;
        const ok = e.key === "PageDown" || e.key === "PageUp" || (empty && (e.key === "ArrowDown" || e.key === "ArrowUp"));
        if (!ok) return;
      } else if (/^(BUTTON|A)$/.test(target.tagName) && e.key === " ") {
        return; // space presses buttons
      }

      // The top-most visible scroll area wins (an open drawer before the page behind it).
      const areas = [...document.querySelectorAll<HTMLElement>("[data-scroll-main]")].filter((el) => el.offsetParent !== null);
      const area = areas[areas.length - 1];
      if (!area) return; // window-scrolled pages keep the browser's own key scrolling
      // Inside some other scrollable box (a list in a panel)? Leave it to the browser.
      if (!field && target !== document.body && !area.contains(target) && hasOwnScroll(target)) return;

      const page = area.clientHeight * 0.85;
      const top =
        e.key === "ArrowDown" ? 72 : e.key === "ArrowUp" ? -72 : e.key === "PageDown" || (e.key === " " && !e.shiftKey) ? page : e.key === "PageUp" || e.key === " " ? -page : null;
      e.preventDefault();
      if (e.key === "Home") area.scrollTo({ top: 0, behavior: "smooth" });
      else if (e.key === "End") area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
      else if (top != null) area.scrollBy({ top, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

function hasOwnScroll(el: HTMLElement | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return true;
  }
  return false;
}
