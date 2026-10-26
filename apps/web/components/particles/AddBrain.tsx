"use client";

import { useEffect, useRef } from "react";

import { createBrainRenderer } from "@/lib/brain-render";

const GHOST = [150, 149, 144] as const;
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

/**
 * "Add a mind": the same turning pixel brain, in grey, with a pixel plus on it.
 * While `active`, it cycles through every mind's color: it could be anyone.
 */
export function AddBrain({ size = 80, colors, active = false, className }: { size?: number; colors: string[]; active?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const key = colors.join(",");

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(size * dpr);
    el.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = createBrainRenderer({ size, color: "#969590", radius: 0.42 });
    const palette = key ? key.split(",").map(hexRgb) : [];
    let angle = 0.6;
    let last = performance.now() / 1000;
    let raf = 0;
    let visible = false;

    const plus = () => {
      const { N, img } = r;
      if (!img) return;
      const d = img.data;
      const cx = Math.round(N * 0.5), cy = Math.round(N * 0.47), arm = Math.round(N * 0.17), th = Math.max(1, Math.round(N * 0.045));
      for (let y = cy - arm - 1; y <= cy + arm + 1; y++)
        for (let x = cx - arm - 1; x <= cx + arm + 1; x++) {
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const bar = (Math.abs(x - cx) <= th && Math.abs(y - cy) <= arm) || (Math.abs(y - cy) <= th && Math.abs(x - cx) <= arm);
          const ring = !bar && ((Math.abs(x - cx) <= th + 1 && Math.abs(y - cy) <= arm + 1) || (Math.abs(y - cy) <= th + 1 && Math.abs(x - cx) <= arm + 1));
          const o = (y * N + x) * 4;
          if (bar) d.set([242, 241, 236, 255], o);
          else if (ring) d.set([5, 5, 6, 255], o);
        }
    };
    const draw = (t: number) => {
      const act = activeRef.current && palette.length > 0;
      r.render({ angle, reveal: 0, opening: true, t, active: act, rgb: act ? palette[Math.floor(t * 3) % palette.length] : GHOST });
      plus();
      r.blit(ctx);
    };
    const loop = (ms: number) => {
      const t = ms / 1000;
      angle += Math.min(0.1, t - last) * (activeRef.current ? 1.5 : 0.5);
      last = t;
      draw(t);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    draw(0);
    if (reduced) return;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) {
        last = performance.now() / 1000;
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [size, key]);

  return <canvas ref={canvas} aria-hidden className={className} style={{ width: size, height: size, display: "block" }} />;
}
