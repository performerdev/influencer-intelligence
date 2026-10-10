"use client";

import { forwardRef } from "react";

/** Side (px) of the square point before GSAP scales it: it becomes the pixel dot of the solid "i". */
export const PRELOADER_POINT_PX = 100;

/**
 * Black screen → a 1px ceramic line draws across → contracts to a point →
 * the point travels to become the dot of the solid "i". No counter.
 * Hidden without JS and with reduced motion (see globals.css).
 */
export const Preloader = forwardRef<HTMLDivElement>(function Preloader(_, ref) {
  return (
    <div ref={ref} className="preloader fixed inset-0 z-[60]" aria-hidden>
      <div data-part="bg" className="absolute inset-0 bg-void" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div data-part="line" className="h-px w-[min(44vw,520px)] bg-ceramic" style={{ transform: "scaleX(0)" }} />
      </div>
      <div
        data-part="point"
        className="absolute left-0 top-0 bg-ceramic opacity-0"
        style={{ width: PRELOADER_POINT_PX, height: PRELOADER_POINT_PX }}
      />
    </div>
  );
});
