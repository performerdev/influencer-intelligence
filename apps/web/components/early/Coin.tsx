"use client";

import { useEffect, useRef } from "react";

import { CoinMotion, createCoin } from "@/lib/early-art";

/**
 * Early Mind's face: the $ii coin, turning. `locked` keeps it dim and facing
 * you; unlocking it lights it up with a quick spin. `active` (Early Mind is
 * typing, pointer over it) turns it faster.
 */
export function Coin({ size = 32, locked = false, active = false, className }: { size?: number; locked?: boolean; active?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motion = useRef<CoinMotion | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    el.width = el.height = px;
    const coin = createCoin(px);
    const m = (motion.current ??= new CoinMotion(locked, reduced));
    let raf = 0;
    let visible = true;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      m.tick(now, dt, activeRef.current);
      coin.draw(m.theta, m.dim);
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(coin.canvas, 0, 0);
      raf = visible && !reduced ? requestAnimationFrame(frame) : 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(el);
    frame(performance.now());
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // the motion lives across size changes; locked is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  useEffect(() => {
    const m = motion.current;
    if (!m) return;
    if (locked && !m.locked) m.lock();
    if (!locked && m.locked) m.unlock(performance.now());
  }, [locked]);

  return <canvas ref={ref} aria-hidden className={className} style={{ width: size, height: size, display: "block", flex: "none" }} />;
}
