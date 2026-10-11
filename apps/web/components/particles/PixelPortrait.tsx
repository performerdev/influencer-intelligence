"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  /** the brain's color: neural pulses fire in it */
  color: string;
  /** css px; the canvas is square */
  size?: number;
  /** more firing (card hover, the model typing) */
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

type Pulse = { x: number; y: number; t0: number; speed: number; life: number };

const hexRgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/**
 * A PFP turned into a living pixel brain. The image is sampled onto a square
 * grid inside a circle and drawn as pixels; "neurons" fire as rings of the
 * brain's color travelling across the face, faster while `active`. On first
 * view the pixels assemble from a scatter. Canvas2D, paused off-screen.
 */
export function PixelPortrait({ src, color, size = 80, active = false, className, style }: Props) {
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

    // Whole css pixels per cell: big portraits read as LED panels, small ones as pixel art.
    const cell = size >= 160 ? 4 : size >= 120 ? 5 : size >= 48 ? 2 : 1;
    const gap = cell >= 4 ? 1 : 0;
    const N = Math.floor(size / cell);
    const off = (size - N * cell) / 2;
    const [cr, cg, cb] = hexRgb(color);

    let cells: { x: number; y: number; r: number; g: number; b: number; a: number; lum: number; phase: number; sx: number; sy: number; delay: number }[] = [];
    let raf = 0;
    let visible = false;
    let born = -1;
    let cancelled = false;
    const pulses: Pulse[] = [];
    let lastSpawn = 0;

    const img = new Image();
    img.decoding = "async";
    img.src = src;
    img.onload = () => {
      if (cancelled) return;
      const tmp = document.createElement("canvas");
      tmp.width = tmp.height = N;
      const t = tmp.getContext("2d", { willReadFrequently: true })!;
      t.imageSmoothingEnabled = true;
      t.imageSmoothingQuality = "high";
      t.drawImage(img, 0, 0, N, N);
      const data = t.getImageData(0, 0, N, N).data;
      const R = N / 2;
      const q = (v: number) => Math.round(v / 24) * 24; // light posterize: pixel-art banding
      const rnd = mulberry(src.length * 7919 + N);
      cells = [];
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const d = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R;
          if (d > 1) continue;
          const i = (y * N + x) * 4;
          // vignette: PFP backgrounds sit at the edge, so the subject in the middle pops
          const v = 1.08 - 0.62 * Math.max(0, d - 0.5) / 0.5;
          const r = q(Math.min(255, data[i] * v));
          const g = q(Math.min(255, data[i + 1] * v));
          const b = q(Math.min(255, data[i + 2] * v));
          const ang = rnd() * Math.PI * 2;
          const far = N * (0.6 + rnd() * 0.8);
          cells.push({
            x,
            y,
            r,
            g,
            b,
            a: d > 0.9 ? (1 - d) / 0.1 : 1, // soft round edge, still in whole pixels
            lum: (0.299 * r + 0.587 * g + 0.114 * b) / 255,
            phase: rnd() * Math.PI * 2,
            sx: Math.cos(ang) * far,
            sy: Math.sin(ang) * far,
            delay: d * 0.35 + rnd() * 0.25,
          });
        }
      if (reduced) {
        born = -10;
        draw(performance.now());
      } else if (visible && !raf) raf = requestAnimationFrame(loop);
    };

    const spawn = (now: number) => {
      // neurons fire from the subject (brighter cells), not the background
      for (let k = 0; k < 8; k++) {
        const c = cells[Math.floor(Math.random() * cells.length)];
        if (c && c.lum > 0.35) {
          pulses.push({ x: c.x, y: c.y, t0: now, speed: N * (0.35 + Math.random() * 0.35), life: 0.9 + Math.random() * 0.6 });
          return;
        }
      }
    };

    function draw(now: number) {
      const t = now / 1000;
      if (born < 0) born = t;
      const age = t - born;
      const act = activeRef.current;
      ctx!.clearRect(0, 0, size, size);

      if (!reduced) {
        const rate = act ? 7 : 1.2; // pulses per second
        if (t - lastSpawn > 1 / rate) {
          spawn(t);
          lastSpawn = t;
        }
        for (let i = pulses.length - 1; i >= 0; i--) if (t - pulses[i].t0 > pulses[i].life) pulses.splice(i, 1);
      }
      const scan = act ? ((t * 0.9) % 1.4) * N - N * 0.2 : -99; // a slow scan line while thinking

      for (const c of cells) {
        // assemble on first view (expo.out per pixel)
        const k = Math.min(1, Math.max(0, (age - c.delay) / 0.7));
        const e = k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
        const px = c.x + c.sx * (1 - e);
        const py = c.y + c.sy * (1 - e);

        let fire = 0;
        for (const p of pulses) {
          const r = (t - p.t0) * p.speed;
          const d = Math.abs(Math.hypot(c.x - p.x, c.y - p.y) - r);
          if (d < 1.3) fire = Math.max(fire, (1 - d / 1.3) * (1 - (t - p.t0) / p.life));
        }
        if (Math.abs(c.y - scan) < 0.8) fire = Math.max(fire, 0.55);
        const shimmer = reduced ? 1 : 0.9 + 0.1 * Math.sin(t * 1.7 + c.phase);
        const f = Math.min(1, fire);
        const r = Math.min(255, (c.r * (1 - f) + cr * f) * shimmer + f * 30);
        const g = Math.min(255, (c.g * (1 - f) + cg * f) * shimmer + f * 30);
        const b = Math.min(255, (c.b * (1 - f) + cb * f) * shimmer + f * 30);
        ctx!.globalAlpha = c.a * (0.25 + 0.75 * e);
        ctx!.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx!.fillRect(off + Math.round(px) * cell, off + Math.round(py) * cell, cell - gap, cell - gap);
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
        if (visible && cells.length && !raf && !reduced) raf = requestAnimationFrame(loop);
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [src, color, size]);

  return <canvas ref={canvas} aria-hidden className={className} style={{ width: size, height: size, display: "block", ...style }} />;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
