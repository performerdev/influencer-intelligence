"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { createBrainRenderer } from "@/lib/brain-render";
import { advanceSignatureAngle, signatureSpeed } from "@/lib/signature";

/** Must match SIGNATURE_RADIUS_FRAC in the hero scene so clusters land exactly. */
const RADIUS_FRAC = 0.36;
const PARTICLE = "#B9B8B2";

type Props = {
  handle: string;
  postsParsed: number | null;
  postsPerDay: number | null;
  /** css px; the canvas is square */
  size?: number;
  /** speeds rotation up ×3 (card hover) */
  active?: boolean;
  /** the brain's color (defaults to particle grey) */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * An intelligence's avatar when it has no PFP yet: the turning pixel brain in
 * its color, drawn with Canvas2D (no WebGL context per card). Turn speed
 * follows posting frequency.
 */
export const ParticleSignature = forwardRef<HTMLCanvasElement, Props>(function ParticleSignature(
  { handle, postsParsed, postsPerDay, size = 80, active = false, color = PARTICLE, className, style },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => canvas.current as HTMLCanvasElement);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(size * dpr);
    el.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const speed = signatureSpeed(postsPerDay);
    const renderer = createBrainRenderer({ size, color, radius: RADIUS_FRAC });
    let mult = 1;
    let raf = 0;
    let visible = false;

    const draw = () => {
      const now = performance.now() / 1000;
      mult += ((activeRef.current ? 3 : 1) - mult) * 0.08;
      const angle = advanceSignatureAngle(handle, speed * mult, now);
      renderer.draw(ctx, { angle, reveal: 0, opening: true, t: now, active: activeRef.current });
    };
    const loop = () => {
      draw();
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    draw();
    if (reduced) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(loop);
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [handle, postsParsed, postsPerDay, size, color]);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={className}
      style={{ width: size, height: size, display: "block", ...style }}
    />
  );
});
