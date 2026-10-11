"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { SIGNATURE_TILT, advanceSignatureAngle, signatureDensity, signaturePoints, signatureSpeed } from "@/lib/signature";

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
 * An intelligence's avatar: a small 3D point cloud, deterministic from the
 * handle, drawn with Canvas2D (no WebGL context per card) as square pixels on
 * a grid — each grid cell lights once, as bright as its nearest point.
 * Density = posts parsed, rotation speed = posting frequency.
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

    const density = signatureDensity(postsParsed);
    const speed = signatureSpeed(postsPerDay);
    const pts = signaturePoints(handle, density);
    const n = pts.length / 3;
    const R = size * RADIUS_FRAC;
    const c = size / 2;
    const ct = Math.cos(SIGNATURE_TILT);
    const st = Math.sin(SIGNATURE_TILT);
    // ~40 cells across, never finer than 1 css px: 80px card → 2px pixels, 200px → 5px
    const grid = Math.max(1, Math.round(size / 40));
    const cellsAcross = Math.ceil(size / grid);
    const light = new Float32Array(cellsAcross * cellsAcross);
    const gap = grid >= 3 ? 1 : 0;
    let mult = 1;
    let raf = 0;
    let visible = false;

    const draw = () => {
      const now = performance.now() / 1000;
      mult += ((activeRef.current ? 3 : 1) - mult) * 0.08;
      const a = advanceSignatureAngle(handle, speed * mult, now);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ctx.clearRect(0, 0, size, size);
      light.fill(0);
      for (let i = 0; i < n; i++) {
        const x0 = pts[i * 3];
        const y0 = pts[i * 3 + 1];
        const z0 = pts[i * 3 + 2];
        // rotate Y, then tilt X — same order as the hero shader
        const x = ca * x0 + sa * z0;
        const z1 = -sa * x0 + ca * z0;
        const y = ct * y0 - st * z1;
        const z = st * y0 + ct * z1;
        const gx = Math.floor((c + x * R) / grid);
        const gy = Math.floor((c - y * R) / grid);
        if (gx < 0 || gy < 0 || gx >= cellsAcross || gy >= cellsAcross) continue;
        const k = gy * cellsAcross + gx;
        const v = 0.42 + 0.58 * (z * 0.5 + 0.5);
        if (v > light[k]) light[k] = v;
      }
      for (let k = 0; k < light.length; k++) {
        if (!light[k]) continue;
        ctx.globalAlpha = light[k];
        ctx.fillRect((k % cellsAcross) * grid, Math.floor(k / cellsAcross) * grid, grid - gap, grid - gap);
      }
      ctx.globalAlpha = 1;
    };

    ctx.fillStyle = color;
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
