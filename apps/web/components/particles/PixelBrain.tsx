"use client";

import { useEffect, useRef } from "react";

import { type PortraitCell, brainGrid, createBrainRenderer } from "@/lib/brain-render";

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
    img.src = src;
    img.onload = () => {
      if (cancelled) return;
      const tmp = document.createElement("canvas");
      tmp.width = tmp.height = N;
      const t = tmp.getContext("2d", { willReadFrequently: true })!;
      t.imageSmoothingQuality = "high";
      t.drawImage(img, 0, 0, N, N);
      const data = t.getImageData(0, 0, N, N).data;
      const R = N / 2;
      const q = (x: number) => Math.round(x / 24) * 24;
      const cells: PortraitCell[] = [];
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const d = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R;
          if (d > 1) continue;
          const i = (y * N + x) * 4;
          const v = 1.08 - (0.62 * Math.max(0, d - 0.5)) / 0.5; // vignette: the subject pops
          cells.push({ x, y, r: q(Math.min(255, data[i] * v)), g: q(Math.min(255, data[i + 1] * v)), b: q(Math.min(255, data[i + 2] * v)), a: d > 0.9 ? (1 - d) / 0.1 : 1 });
        }
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
