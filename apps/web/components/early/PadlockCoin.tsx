"use client";

import { useEffect, useRef } from "react";

import { CoinMotion, createCoin } from "@/lib/early-art";

const S = 132; // css px

/**
 * The reward on the tasks card: the $ii coin behind a padlock with three
 * lights, one per task. When the third one lights, the shackle pops, the lock
 * drops away and the coin lights up and turns. Calls `onOpen` once the lock is gone.
 */
export function PadlockCoin({ done, onOpen }: { done: number; onOpen?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(done);
  doneRef.current = done;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  // already open on first paint (a reload after the tasks): no lock at all
  const startOpen = useRef(done >= 3);

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = el.height = Math.round(S * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const coin = createCoin(Math.round(92 * dpr));
    const m = new CoinMotion(!startOpen.current, reduced);
    let openAt = startOpen.current ? -1e9 : Infinity;
    let told = startOpen.current;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (doneRef.current >= 3 && openAt === Infinity) openAt = now + (reduced ? 0 : 250);
      if (m.locked && now >= openAt + (reduced ? 0 : 270)) m.unlock(now);
      m.tick(now, dt);
      coin.draw(m.theta, m.dim);
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(coin.canvas, 20, 4, 92, 92);

      const e = (now - openAt) / 1000;
      const lift = e > 0 ? Math.round(Math.min(1, e / 0.2) * 8) : 0;
      const drop = e > 0.2 ? Math.min(1, (e - 0.2) / 0.45) : 0;
      if (drop < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - drop;
        ctx.translate(0, Math.round((drop * drop * 26) / 2) * 2);
        const bx = 46;
        const by = 78;
        const bw = 40;
        const bh = 32;
        ctx.fillStyle = "#f2f1ec";
        ctx.fillRect(52, 60 - lift, 4, 18 + lift); // left leg stays in the body
        ctx.fillRect(76, 60 - lift, 4, lift ? 10 : 18); // right leg pops out
        ctx.fillRect(52, 56 - lift, 28, 4);
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "#0c0c0e";
        ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
        ctx.clearRect(bx, by, 2, 2);
        ctx.clearRect(bx + bw - 2, by, 2, 2);
        ctx.clearRect(bx, by + bh - 2, 2, 2);
        ctx.clearRect(bx + bw - 2, by + bh - 2, 2, 2);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < doneRef.current ? "#f2f1ec" : "#3a3a3f";
          ctx.fillRect(bx + 7 + i * 10, by + 13, 6, 6);
        }
        ctx.restore();
      } else if (!told) {
        told = true;
        openRef.current?.();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} aria-hidden style={{ width: S, height: S, display: "block", flex: "none" }} />;
}
