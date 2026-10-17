"use client";

import { useEffect, useRef } from "react";

import { brainGrid, createBrainRenderer, portraitCells } from "@/lib/brain-render";

type Props = {
  handle: string;
  src: string;
  /** the brain's color */
  color: string;
  size?: number;
  /** spin faster and stay a brain (card hover, the model thinking) */
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

/* the loop: turn as a brain, unfold into the PFP, hold, fold back */
const SPIN = 7.5;
const MORPH = 1.1;
const HOLD = 1.6;
const CYCLE = SPIN + MORPH + HOLD + MORPH;

/**
 * The intelligence's mind as a turning pixel brain in its color, built from
 * its PFP's colors. Every few seconds the brain unfolds into the PFP, holds,
 * and folds back: each brain point owns one portrait pixel, matched row by
 * row, so the face pours out of the brain top to bottom.
 */
export function PixelBrain({ handle, src, color, size = 80, active = false, className, style }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(size * dpr);
    el.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { N } = brainGrid(size);
    let renderer: ReturnType<typeof createBrainRenderer> | null = null;
    let raf = 0;
    let visible = false;
    let cancelled = false;
    let phase = Math.random() * SPIN; // cards don't all reveal at once
    let last = performance.now() / 1000;
    let angle = Math.random() * Math.PI * 2;

    const img = new Image();
    img.decoding = "async";
    // no PFP (or it can't be loaded): the brain alone, in its color
    img.onerror = () => {
      if (cancelled) return;
      renderer = createBrainRenderer({ size, color, radius: 0.42 });
      if (reduced) renderer.draw(ctx, { angle: Math.PI / 2, reveal: 0, opening: true, t: 0, active: false });
      else if (visible && !raf) raf = requestAnimationFrame(loop);
    };
    img.src = src;
    img.onload = () => {
      if (cancelled) return;
      const cells = portraitCells(img, N);
      renderer = createBrainRenderer({ size, color, radius: 0.42, portrait: cells });
      if (reduced) renderer.draw(ctx, { angle: Math.PI / 2, reveal: 0, opening: true, t: 0, active: false });
      else if (visible && !raf) raf = requestAnimationFrame(loop);
    };

    function frame(now: number) {
      if (!renderer) return;
      const t = now / 1000;
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      const act = activeRef.current;
      angle += dt * (act ? 1.5 : 0.5);
      phase = (phase + dt) % CYCLE;
      // thinking keeps it a brain: the reveal waits until it's done
      if (act && phase > SPIN) phase = SPIN - 0.01;
      let reveal = 0;
      if (phase > SPIN && phase < SPIN + MORPH) reveal = (phase - SPIN) / MORPH;
      else if (phase >= SPIN + MORPH && phase < SPIN + MORPH + HOLD) reveal = 1;
      else if (phase >= SPIN + MORPH + HOLD) reveal = 1 - (phase - SPIN - MORPH - HOLD) / MORPH;
      renderer.draw(ctx!, { angle, reveal, opening: phase < SPIN + MORPH + HOLD, t, active: act });
    }

    const loop = (now: number) => {
      frame(now);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && renderer && !raf && !reduced) {
          last = performance.now() / 1000;
          raf = requestAnimationFrame(loop);
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [handle, src, color, size]);

  return <canvas ref={canvas} aria-hidden className={className} style={{ width: size, height: size, display: "block", ...style }} />;
}
