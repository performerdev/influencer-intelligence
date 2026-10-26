"use client";

import { forwardRef } from "react";

import { LogoMark } from "@/components/layout/LogoMark";
import { site } from "@/config/site";

type Props = {
  /** the box the WebGL "ii" is fitted into */
  iiBoxRef: React.Ref<HTMLDivElement>;
  /** the canvas over that box (a little larger, so a key can sink) */
  canvasRef: React.Ref<HTMLCanvasElement>;
  onPick: () => void;
  /** no WebGL: draw the SVG mark in the box instead */
  staticLogo?: boolean;
};

/**
 * Screen 1: the "ii" (drawn by ii-stage.ts into the canvas over `iiBoxRef`),
 * the headline, the two actions and the scroll cue. Every `data-d` element
 * dithers in as the letters set.
 */
export const Hero = forwardRef<HTMLElement, Props>(function Hero({ iiBoxRef, canvasRef, onPick, staticLogo }, ref) {
  return (
    <section ref={ref} className="relative z-10 flex h-[100svh] min-h-[600px] flex-col items-center pt-topbar" aria-labelledby="hero-title">
      <div className="mt-[3vh] grid min-h-0 w-full max-w-[460px] flex-1 place-items-center px-gutter">
        <div ref={iiBoxRef} className="relative aspect-[144/225] h-[min(72%,230px)] max-w-full sm:h-[min(88%,300px)]">
          {staticLogo ? (
            <LogoMark detail="led" className="h-full w-auto" />
          ) : (
            <canvas ref={canvasRef} className="pointer-events-none absolute -left-2 -top-3 h-[calc(100%+24px)] w-[calc(100%+16px)]" />
          )}
        </div>
      </div>

      <div className="px-gutter pb-[clamp(76px,12vh,124px)] pt-[clamp(18px,3.5vh,40px)] text-center">
        <h1 id="hero-title" aria-label={site.tagline} className="text-display font-medium [text-wrap:balance]">
          <span className="dither dither-pre block" data-d="l1" aria-hidden>
            {site.headline[0]}
          </span>
          <span className="dither dither-pre block" data-d="l2" aria-hidden>
            {site.headline[1]}
          </span>
        </h1>
        <p className="dither dither-pre mx-auto mt-5 max-w-[34ch] text-lead text-particle sm:max-w-none" data-d="lead">
          {site.description}
        </p>
        <div className="dither dither-pre mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-4" data-d="cta">
          <button type="button" className="btn-ceramic" onClick={onPick}>
            Pick an intelligence
          </button>
          <a href={site.githubUrl} target="_blank" rel="noreferrer" className="link-quiet">
            View the source <span className="arrow" aria-hidden>↗</span>
          </a>
        </div>
      </div>

      <div className="dither dither-pre pointer-events-none absolute inset-x-0 bottom-6" data-d="cue" aria-hidden>
        <div className="flex flex-col items-center gap-2">
          <span className="font-pixel text-xs text-muted">Scroll</span>
          <span className="scroll-cue block h-6 w-px origin-top bg-muted" />
        </div>
      </div>
    </section>
  );
});
