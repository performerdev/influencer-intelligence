"use client";

import { useEffect, useRef } from "react";

import { SIGNATURE_TILT, brainPoints } from "@/lib/signature";

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

const hexRgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/* the loop: spin as a brain, unfold into the PFP, hold, fold back */
const SPIN = 6.2;
const MORPH = 1.1;
const HOLD = 1.6;
const CYCLE = SPIN + MORPH + HOLD + MORPH;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The intelligence's mind as a rotating pixel brain, built from its PFP's
 * colors. Every few seconds the brain unfolds into the PFP, holds, and folds
 * back. Each pixel of the portrait is one point of the brain, matched row by
 * row, so the face pours out of the brain top to bottom. Canvas2D.
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

    const cell = size >= 160 ? 4 : size >= 60 ? 2 : 1;
    const gap = cell >= 4 ? 1 : 0;
    const N = Math.floor(size / cell);
    const off = (size - N * cell) / 2;
    const [br, bg, bb] = hexRgb(color);

    type P = { bx: number; by: number; bz: number; fold: number; px: number; py: number; r: number; g: number; b: number; a: number; row: number };
    let pts: P[] = [];
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
      const cells: { x: number; y: number; r: number; g: number; b: number; a: number }[] = [];
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const d = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R;
          if (d > 1) continue;
          const i = (y * N + x) * 4;
          const v = 1.08 - (0.62 * Math.max(0, d - 0.5)) / 0.5; // vignette: the subject pops
          cells.push({ x, y, r: q(Math.min(255, data[i] * v)), g: q(Math.min(255, data[i + 1] * v)), b: q(Math.min(255, data[i + 2] * v)), a: d > 0.9 ? (1 - d) / 0.1 : 1 });
        }
      // one brain point per portrait pixel, matched top-to-bottom so the face pours out in order
      const folds = new Float32Array(cells.length);
      const raw = brainPoints(handle, cells.length, 0x5eed, folds);
      const brain = Array.from({ length: cells.length }, (_, i) => ({ x: raw[i * 3], y: raw[i * 3 + 1], z: raw[i * 3 + 2], f: folds[i] })).sort((a, b) => b.y - a.y || a.x - b.x);
      const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
      pts = sorted.map((c, i) => ({ bx: brain[i].x, by: brain[i].y, bz: brain[i].z, fold: brain[i].f, px: c.x, py: c.y, r: c.r, g: c.g, b: c.b, a: c.a, row: c.y / N }));
      if (reduced) draw(0);
      else if (visible && !raf) raf = requestAnimationFrame(loop);
    };

    function draw(now: number) {
      const t = now / 1000;
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      const act = activeRef.current;
      angle += dt * (act ? 1.6 : 0.55);
      phase = (phase + dt) % CYCLE;
      // thinking keeps it a brain: the reveal waits until it's done
      if (act && phase > SPIN) phase = SPIN - 0.01;

      // 0 = brain, 1 = portrait (per point, staggered by row)
      let global = 0;
      if (phase > SPIN && phase < SPIN + MORPH) global = (phase - SPIN) / MORPH;
      else if (phase >= SPIN + MORPH && phase < SPIN + MORPH + HOLD) global = 1;
      else if (phase >= SPIN + MORPH + HOLD) global = 1 - (phase - SPIN - MORPH - HOLD) / MORPH;
      const opening = phase < SPIN + MORPH + HOLD;

      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const ct = Math.cos(SIGNATURE_TILT);
      const st = Math.sin(SIGNATURE_TILT);
      const scale = size * 0.4;
      const c = size / 2;
      ctx!.clearRect(0, 0, size, size);

      for (const p of pts) {
        // stagger: top rows lead on the way out, bottom rows lead on the way back
        const lead = opening ? p.row : 1 - p.row;
        const m = ease(Math.min(1, Math.max(0, (global - lead * 0.35) / 0.65)));
        // brain, rotated around y and tilted
        const x = ca * p.bx + sa * p.bz;
        const z1 = -sa * p.bx + ca * p.bz;
        const y = ct * p.by - st * z1;
        const z = st * p.by + ct * z1;
        const persp = 1 / (1.9 - z * 0.45);
        const bxp = c + x * scale * persp * 1.9;
        const byp = c - y * scale * persp * 1.9;
        const sx = bxp + (off + p.px * cell + cell / 2 - bxp) * m;
        const sy = byp + (off + p.py * cell + cell / 2 - byp) * m;

        const depth = 0.35 + 0.65 * (z * 0.5 + 0.5);
        // light from the upper left (surface normal ≈ direction from the center), ridges catch it, grooves don't
        const len = Math.hypot(x, y, z) || 1;
        const light = Math.max(0, (-0.45 * x + 0.6 * y + 0.66 * z) / len);
        const lit = (0.5 + 1.0 * light) * (0.5 + 0.8 * p.fold);
        // as a brain: the PFP's colors pulled toward the brain's color; as a portrait: the PFP itself
        const tint = 0.68 * (1 - m);
        const shade = Math.min(1.6, lit * (0.6 + 0.4 * depth)) * (1 - m) + m;
        const r = Math.min(255, (p.r * (1 - tint) + br * tint) * shade) | 0;
        const g = Math.min(255, (p.g * (1 - tint) + bg * tint) * shade) | 0;
        const b = Math.min(255, (p.b * (1 - tint) + bb * tint) * shade) | 0;
        ctx!.globalAlpha = p.a * (m + (1 - m) * (0.45 + 0.55 * depth));
        ctx!.fillStyle = `rgb(${r},${g},${b})`;
        ctx!.fillRect(Math.round((sx - cell / 2) / cell) * cell, Math.round((sy - cell / 2) / cell) * cell, cell - gap, cell - gap);
      }
      ctx!.globalAlpha = 1;
    }

    const loop = (now: number) => {
      draw(now);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && pts.length && !raf && !reduced) {
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
