"use client";

import { useEffect, useState } from "react";

import { PixelPortrait } from "@/components/particles/PixelPortrait";

type Face = { handle: string; avatar?: string; color: string };

/**
 * Three minds side by side in circles (a group chat). Every few seconds each
 * circle moves on to another mind, one after another, the new face assembling
 * from pixels: any of them can be in the room.
 */
export function MindStack({ minds, size = 24, overlap = 0.28 }: { minds: Face[]; size?: number; overlap?: number }) {
  const faces = minds.filter((m) => m.avatar);
  const n = faces.length;
  const [ticks, setTicks] = useState([0, 0, 0]);

  useEffect(() => {
    if (n < 5 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stops = [0, 1, 2].map((k) => {
      let every = 0;
      const first = window.setTimeout(() => {
        const step = () => setTicks((t) => t.map((v, i) => (i === k ? v + 1 : v)));
        step();
        every = window.setInterval(step, 3600);
      }, 2400 + k * 1200);
      return () => {
        window.clearTimeout(first);
        window.clearInterval(every);
      };
    });
    return () => stops.forEach((s) => s());
  }, [n]);

  if (n < 3) return null;
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {[0, 1, 2].map((k) => {
        // slot k walks k, k+3, k+6…: the three circles never show the same mind
        const f = faces[(k + 3 * ticks[k]) % n];
        return (
          <span key={k} className="relative" style={{ marginLeft: k ? -Math.round(size * overlap) : 0, zIndex: 3 - k }}>
            <PixelPortrait key={f.handle} src={f.avatar!} color={f.color} size={size} />
          </span>
        );
      })}
    </span>
  );
}
