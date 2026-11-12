"use client";

import { useEffect, useImperativeHandle, useRef } from "react";

import { early, earlyCode } from "@/config/early";
import { brainGrid, createBrainRenderer, portraitCells } from "@/lib/brain-render";
import { drawII, drawLogo, fontFamily, stubAvatar } from "@/lib/early-art";

export type CardHandle = { blob: () => Promise<Blob | null>; dataUrl: () => string | null };

const W = 1200;
const H = 675;
const K = 2; // drawn at 2400×1350

/**
 * The Early Mind card (16:9, made to be posted on X): the person's PFP as a
 * pixel brain in their color that unfolds into the PFP, their handle, the
 * allocation and their number. Drawn on a canvas so it can be copied.
 */
export function EarlyCard({
  handle,
  number,
  color,
  animate = false,
  ref,
  className,
}: {
  handle: string;
  number: number;
  color: string;
  animate?: boolean;
  ref?: React.Ref<CardHandle>;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    blob: () => new Promise((res) => (canvas.current ? canvas.current.toBlob((b) => res(b), "image/png") : res(null))),
    dataUrl: () => canvas.current?.toDataURL("image/png") ?? null,
  }));

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    el.width = W * K;
    el.height = H * K;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pixel = fontFamily("--font-geist-pixel-square");
    const sans = fontFamily("--font-geist-sans");
    const PX = (s: number) => `400 ${s}px ${pixel}`;
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const size = 440 * K;
    const { N, cell, off } = brainGrid(size);
    const bc = document.createElement("canvas");
    bc.width = bc.height = size;
    const bctx = bc.getContext("2d")!;
    let cancelled = false;
    let raf = 0;

    const step = (x: number, y: number, w: number, h: number, s: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.fillRect(x + s, y, w - 2 * s, h);
      ctx.fillRect(x, y + s, w, h - 2 * s);
    };
    const fit = (text: string, maxW: number, start: number, min: number) => {
      let s = start;
      for (; s > min; s -= 2) {
        ctx.font = PX(s);
        if (ctx.measureText(text).width <= maxW) break;
      }
      return s;
    };

    const paint = () => {
      const x0 = 560;
      const x1 = 1128;
      ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.fillStyle = "#050506";
      ctx.fillRect(0, 0, W, H);
      step(16, 16, W - 32, H - 32, 6, "#232327");
      step(18, 18, W - 36, H - 36, 5, "#0c0c0e");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bc, 64, 118, 440, 440);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.font = PX(22);
      ctx.fillStyle = "#6b6b70";
      ctx.fillText("EARLY MIND", x0, 150);
      ctx.textAlign = "right";
      ctx.fillStyle = color;
      ctx.fillText(earlyCode(number), x1, 150);
      ctx.fillStyle = "#232327";
      ctx.fillRect(x0, 172, x1 - x0, 2);
      ctx.textAlign = "left";
      ctx.fillStyle = "#f2f1ec";
      ctx.font = PX(fit(`@${handle}`, x1 - x0, 56, 28));
      ctx.fillText(`@${handle}`, x0, 248);
      const amt = `${early.base.toLocaleString("en-US")} `;
      const s = fit(`${amt}$ii`, x1 - x0, 104, 48);
      ctx.font = PX(s);
      ctx.fillText(amt, x0, 380);
      let ax = x0 + ctx.measureText(amt).width;
      ctx.fillStyle = color;
      ctx.fillText("$", ax, 380);
      ax += ctx.measureText("$").width;
      drawII(ctx, ax + s * 0.06, 380, ctx.measureText("0").actualBoundingBoxAscent || s * 0.7, color);
      ctx.font = PX(20);
      ctx.fillStyle = "#6b6b70";
      ctx.fillText("reserved · final at the snapshot", x0, 420);
      ctx.fillStyle = "#232327";
      ctx.fillRect(x0, 452, x1 - x0, 2);
      ctx.font = PX(18);
      ctx.fillStyle = "#6b6b70";
      ctx.fillText("TRACK RECORD", x0, 494);
      ctx.strokeStyle = "#f2f1ec";
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, 515, 96, 34);
      ctx.font = PX(16);
      ctx.fillStyle = "#f2f1ec";
      ctx.textAlign = "center";
      ctx.fillText("EARLY", x0 + 49, 538);
      ctx.textAlign = "left";
      ctx.font = PX(28);
      ctx.fillText("$", x0 + 116, 542);
      drawII(ctx, x0 + 116 + ctx.measureText("$").width + 2, 542, ctx.measureText("0").actualBoundingBoxAscent || 20, "#f2f1ec");
      ctx.font = PX(18);
      ctx.fillStyle = "#b9b8b2";
      ctx.fillText(`called ${date}`, x0 + 182, 540);
      ctx.textAlign = "right";
      ctx.fillStyle = "#6b6b70";
      ctx.fillText("before launch", x1, 540);
      drawLogo(ctx, x0, 584, 1.6);
      ctx.textAlign = "left";
      ctx.font = PX(22);
      ctx.fillStyle = "#f2f1ec";
      ctx.fillText("ii.plus", x0 + 40, 618);
      ctx.textAlign = "right";
      ctx.font = `400 18px ${sans}`;
      ctx.fillStyle = "#b9b8b2";
      ctx.fillText("Every CT mind, now an AI.", x1, 617);
    };

    const start = (src: CanvasImageSource) => {
      if (cancelled) return;
      const brain = createBrainRenderer({ size, color, radius: 0.42, portrait: portraitCells(src, N) });
      const frameAt = (el: number) => {
        const reveal = Math.min(1, Math.max(0, (el - 1.3) / 1.4));
        brain.draw(bctx, { angle: el * 1.1, reveal, opening: true, t: el, active: el < 1.3 });
        // a wider LED gap than the brains', so the portrait reads at post size
        bctx.globalCompositeOperation = "destination-out";
        for (let q = 1; q <= N; q++) {
          bctx.fillRect(off + q * cell - 2, 0, 2, size);
          bctx.fillRect(0, off + q * cell - 2, size, 2);
        }
        bctx.globalCompositeOperation = "source-over";
        paint();
      };
      if (!animate || reduced) return frameAt(10);
      const t0 = performance.now();
      const loop = (now: number) => {
        const e = (now - t0) / 1000;
        frameAt(e);
        if (e < 2.8 && !cancelled) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    // fonts first (the card is mostly type), then the PFP from our own origin so its pixels can be read
    Promise.all([document.fonts.load(PX(52)).catch(() => null), document.fonts.load(`400 18px ${sans}`).catch(() => null)]).then(() => {
      if (cancelled) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => start(img);
      img.onerror = () => start(stubAvatar(handle));
      img.src = `/api/early/pfp/${encodeURIComponent(handle)}`;
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [handle, number, color, animate]);

  return <canvas ref={canvas} aria-label={`Early Mind card for @${handle}, ${earlyCode(number)}`} className={className} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "16 / 9", background: "#050506" }} />;
}
