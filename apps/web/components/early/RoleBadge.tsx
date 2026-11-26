"use client";

import { useEffect, useRef } from "react";

import { ROLE_INK, createRole } from "@/lib/waitlist-art";

/**
 * The Waitlist role as a badge (Waitlist Mind's face, the door in the top bar).
 * A beam sweeps across it once when it comes into view, and keeps sweeping
 * while `active` (pointer over it, Waitlist Mind typing).
 */
export function RoleBadge({ size = 32, color = ROLE_INK, lit = true, active = false, className }: { size?: number; color?: string; lit?: boolean; active?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    el.width = el.height = px;
    const role = createRole(px, color);
    const level = lit ? 1 : 0;
    let raf = 0;
    let start = -1;
    const SWEEP = 0.9;
    const paint = (beam: number) => {
      role.draw(level, beam);
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(role.canvas, 0, 0);
    };
    const frame = (now: number) => {
      if (start < 0) start = now;
      const e = (now - start) / 1000;
      const beam = -0.15 + (e / SWEEP) * 1.3;
      if (beam > 1.15) {
        paint(-1);
        if (activeRef.current) {
          start = now + 700; // a breath between sweeps
          raf = requestAnimationFrame(frame);
        } else raf = 0;
        return;
      }
      paint(e < 0 ? -1 : beam);
      raf = requestAnimationFrame(frame);
    };
    const sweep = () => {
      if (reduced || raf) return;
      start = -1;
      raf = requestAnimationFrame(frame);
    };
    kick.current = sweep;
    paint(-1);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        sweep();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [size, color, lit]);

  useEffect(() => {
    if (active) kick.current();
  }, [active]);

  return <canvas ref={ref} aria-hidden className={className} style={{ width: size, height: size, display: "block", flex: "none" }} />;
}
