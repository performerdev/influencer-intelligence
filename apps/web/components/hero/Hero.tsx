"use client";

import { Fragment, forwardRef } from "react";

import { LogoMark } from "@/components/layout/LogoMark";
import { site } from "@/config/site";

const LINES = [
  ["Every", "mind", "on", "Crypto", "Twitter."],
  ["Cloned", "in", "the", "open."],
];

type Props = {
  logoSlotRef: React.Ref<HTMLDivElement>;
  onPick: () => void;
  /** no WebGL: draw the SVG mark in the slot instead */
  staticLogo?: boolean;
};

/**
 * Screen 1 — DOM layer of the hero. The 3D mark itself lives in the fixed
 * canvas (HeroScene) and is fitted into `logoSlotRef`; this component owns
 * the copy, the two actions and the scroll cue.
 */
export const Hero = forwardRef<HTMLElement, Props>(function Hero({ logoSlotRef, onPick, staticLogo }, ref) {
  return (
    <section ref={ref} className="relative z-10 flex h-[100svh] min-h-[600px] flex-col pt-topbar" aria-labelledby="hero-title">
      {/* The 3D "ii" is fitted into this box. */}
      <div ref={logoSlotRef} className="mx-auto mt-[3vh] flex w-full max-w-[520px] flex-1 items-center justify-center" aria-hidden>
        {staticLogo && <LogoMark detail="led" className="h-[86%] w-auto" />}
      </div>

      <div className="px-gutter pb-[clamp(72px,12vh,128px)] pt-[clamp(20px,4vh,44px)] text-center" style={{ opacity: "var(--hero-fade, 1)" }}>
        <h1 id="hero-title" aria-label={site.tagline} className="text-display font-medium [text-wrap:balance]">
          {LINES.map((line, li) => (
            <span key={li} className="block" aria-hidden>
              {line.map((w, wi) => (
                <Fragment key={wi}>
                  <span className="mask-line">
                    <span className="mask-word hero-word">{w}</span>
                  </span>
                  {wi < line.length - 1 ? " " : null}
                </Fragment>
              ))}
            </span>
          ))}
        </h1>
        <p className="hero-follow mx-auto mt-5 max-w-[34ch] text-lead text-particle sm:max-w-none" data-step="0">
          {site.description}
        </p>
        <div className="hero-follow mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-4" data-step="1">
          <button type="button" className="btn-ceramic" onClick={onPick}>
            Pick an intelligence
          </button>
          <a href={site.githubUrl} target="_blank" rel="noreferrer" className="link-quiet">
            View the source <span className="arrow" aria-hidden>↗</span>
          </a>
        </div>
      </div>

      <div className="hero-follow pointer-events-none absolute inset-x-0 bottom-6" data-step="2" aria-hidden>
        <div className="flex flex-col items-center gap-2" style={{ opacity: "var(--hero-fade, 1)" }}>
        <span className="font-pixel text-xs text-muted">Scroll</span>
        <span className="scroll-cue block h-6 w-px origin-top bg-muted" />
        </div>
      </div>
    </section>
  );
});
