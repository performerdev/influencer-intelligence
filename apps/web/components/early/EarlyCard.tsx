"use client";

import { useEffect, useImperativeHandle, useRef } from "react";

import { earlyCode } from "@/config/early";
import { createBrainRenderer } from "@/lib/brain-render";
import { drawLogo, fontFamily } from "@/lib/early-art";
import { ledMatrix } from "@/lib/waitlist-art";

export type CardHandle = { blob: () => Promise<Blob | null>; dataUrl: () => string | null };

const W = 1200;
const H = 675;
const K = 2; // drawn at 2400×1350

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
const css = (c: number[]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

const CERAMIC = [242, 241, 236];
const UNLIT = [22, 22, 25];
const WHITE = [255, 255, 255];

/**
 * Two cards, one per person, picked from the spot number so it never changes:
 * "board" is the spot on a big LED board; "brain" is their brain in their color
 * with the spot on a smaller board beside it.
 */
export type CardKind = "board" | "brain";
export function cardKind(number: number): CardKind {
  let h = Math.imul(number ^ 0x7feb352d, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) & 1 ? "brain" : "board";
}

/**
 * The waitlist card (16:9, made to be posted on X). The spot number sits on an
 * LED board with the site's scan beam passing over it: what the beam has just
 * passed glows in the person's color and cools back to ceramic. Either the
 * board fills the card, or their brain does and the board sits beside it (see
 * cardKind). Their handle, IN LINE and the day they got the spot. Drawn on a
 * canvas so it can be copied.
 */
export function EarlyCard({
  handle,
  number,
  color,
  joined,
  animate = false,
  ref,
  className,
}: {
  handle: string;
  number: number;
  color: string;
  /** when the spot was given (ISO); today if missing */
  joined?: string | null;
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
    const mono = fontFamily("--font-geist-mono");
    const sans = fontFamily("--font-geist-sans");
    const day = joined ? new Date(joined) : new Date();
    const date = day.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "").toUpperCase();
    const kind = cardKind(number);
    const hot = rgb(color);
    // where the beam rests on the finished card, 0…1 across the board
    const REST = kind === "board" ? 0.66 : 0.62;
    const board = ledMatrix(kind === "board" ? earlyCode(number) : String(number).padStart(4, "0"));
    const RX = 640; // the right column of the brain card
    const cell = kind === "board" ? Math.min(34, 986 / board.cols) : Math.min(22, (W - 56 - RX) / board.cols);
    const bw = board.cols * cell;
    const bx = kind === "board" ? (W - bw) / 2 : RX;
    const by = kind === "board" ? 287 - (7 * cell) / 2 : 194;
    const BS = 540; // the brain, css px
    const brainCanvas = kind === "brain" ? document.createElement("canvas") : null;
    const brain = brainCanvas ? createBrainRenderer({ size: BS * K, color, radius: 0.42 }) : null;
    if (brainCanvas) brainCanvas.width = brainCanvas.height = BS * K;
    let cancelled = false;
    let raf = 0;

    const text = (s: string, x: number, y: number, font: string, fill: string, align: CanvasTextAlign = "left", spacing = 0) => {
      ctx.font = font;
      ctx.fillStyle = fill;
      ctx.textAlign = align;
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
      ctx.fillText(s, x, y);
    };
    const fit = (s: string, maxW: number, start: number, min: number) => {
      let size = start;
      for (; size > min; size -= 2) {
        ctx.font = `400 ${size}px ${pixel}`;
        if (ctx.measureText(s).width <= maxW) break;
      }
      return size;
    };
    /** one LED cell as 3×3 points, like the right letter of the ii mark */
    const points = (x: number, y: number, c: number[]) => {
      const p = cell / 3;
      const s = Math.max(1, p * 0.62);
      ctx.fillStyle = css(c);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) ctx.fillRect(x + i * p + (p - s) / 2, y + j * p + (p - s) / 2, s, s);
    };

    /** the spot on the board: lit cells take the beam's heat and cool to ceramic behind it */
    const drawBoard = (beam: number) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < board.cols; x++) {
          const cx = bx + x * cell;
          const cy = by + y * cell;
          if (!board.lit[y][x]) {
            points(cx, cy, UNLIT);
            continue;
          }
          const d = beam - (x + 0.5) / board.cols;
          let c = d < 0 ? CERAMIC : mix(hot, CERAMIC, clamp(d / 0.5));
          c = mix(c, WHITE, Math.max(0, 1 - Math.abs(d) / 0.035) * 0.9);
          points(cx, cy, c);
        }
      if (beam > -0.02 && beam < 1.02) {
        const lx = bx + beam * bw;
        const pad = kind === "board" ? 14 : 10;
        const g = ctx.createLinearGradient(lx - 30, 0, lx + 30, 0);
        g.addColorStop(0, `rgba(${hot[0]},${hot[1]},${hot[2]},0)`);
        g.addColorStop(0.5, `rgba(${hot[0]},${hot[1]},${hot[2]},0.16)`);
        g.addColorStop(1, `rgba(${hot[0]},${hot[1]},${hot[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(lx - 30, by - pad, 60, 7 * cell + 2 * pad);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(lx, by - pad, 1.5, 7 * cell + 2 * pad);
      }
    };

    const frame = () => {
      ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#050506";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#18181b";
      ctx.lineWidth = 1;
      ctx.strokeRect(24.5, 24.5, W - 49, H - 49);
    };

    /** the spot on a big LED board, handle and date underneath */
    const paintBoard = (beam: number) => {
      frame();
      drawLogo(ctx, 56, 52, 1.2);
      text("ii.plus", 84, 77, `400 16px ${pixel}`, "#f2f1ec");
      text("WAITLIST · ROLE GRANTED", W - 56, 77, `400 13px ${mono}`, "#6b6b70", "right", 2);
      drawBoard(beam);
      ctx.fillStyle = "#232327";
      ctx.fillRect(56, 520, W - 112, 1);
      text(`@${handle}`, 56, 572, `400 ${fit(`@${handle}`, 520, 36, 20)}px ${pixel}`, "#f2f1ec");
      text("IN LINE", W / 2 + 60, 572, `400 16px ${mono}`, "#b9b8b2", "left", 3);
      text(date, W - 56, 572, `400 16px ${mono}`, "#b9b8b2", "right", 3);
      text("First in when doors open. One spot per X account.", 56, 612, `400 15px ${sans}`, "#6b6b70");
      text("before doors open", W - 56, 612, `400 13px ${mono}`, "#6b6b70", "right");
    };

    /** their brain on the left; WAITLIST, the spot on a board, handle on the right */
    const paintBrain = (beam: number, angle: number, t: number, active: boolean) => {
      frame();
      const cx = 36 + BS / 2;
      const cy = 70 + BS / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, BS * 0.62);
      g.addColorStop(0, `rgba(${hot[0]},${hot[1]},${hot[2]},0.13)`);
      g.addColorStop(1, `rgba(${hot[0]},${hot[1]},${hot[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - BS * 0.62, cy - BS * 0.62, BS * 1.24, BS * 1.24);
      if (brain && brainCanvas) {
        const bctx = brainCanvas.getContext("2d")!;
        bctx.clearRect(0, 0, brainCanvas.width, brainCanvas.height);
        brain.draw(bctx, { angle, reveal: 0, opening: true, t, active });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(brainCanvas, 36, 70, BS, BS);
      }
      text("WAITLIST", RX, 112, `400 34px ${pixel}`, "#f2f1ec", "left", 6);
      text("QUEUE POSITION", RX, 172, `400 12px ${mono}`, "#6b6b70", "left", 3);
      drawBoard(beam);
      ctx.fillStyle = "#232327";
      ctx.fillRect(RX, 380, W - 56 - RX, 1);
      text(`@${handle}`, RX, 436, `400 ${fit(`@${handle}`, W - 56 - RX, 34, 18)}px ${pixel}`, "#f2f1ec");
      text("ROLE GRANTED · IN LINE", RX, 472, `400 12px ${mono}`, color, "left", 3);
      drawLogo(ctx, RX, H - 78, 1.25);
      text("ii.plus", RX + 32, H - 52, `400 18px ${pixel}`, "#f2f1ec");
      text(date, W - 56, H - 52, `400 15px ${sans}`, "#b9b8b2", "right");
    };

    const ANGLE = 0.9;
    const paint = (beam: number, spin = 0, t = 3) => (kind === "board" ? paintBoard(beam) : paintBrain(beam, ANGLE - spin, t, spin > 0.01));

    // the card is all type: fonts first
    Promise.all([`400 36px ${pixel}`, `400 16px ${mono}`, `400 15px ${sans}`].map((f) => document.fonts.load(f).catch(() => null))).then(() => {
      if (cancelled) return;
      if (!animate || reduced) return paint(REST);
      // the beam sweeps in from the left and settles where it rests on the card; the brain turns into place
      const t0 = performance.now();
      const DUR = 1.5;
      const loop = (now: number) => {
        const e = Math.min(1, (now - t0) / 1000 / DUR);
        const k = 1 - (1 - e) ** 3;
        if (e >= 1) return paint(REST); // the last frame is the card exactly as it downloads
        paint(-0.06 + (REST + 0.06) * k, 2.4 * (1 - k), 3 + (now - t0) / 1000);
        if (!cancelled) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [handle, number, color, joined, animate]);

  return <canvas ref={canvas} aria-label={`Waitlist card for @${handle}, spot ${earlyCode(number)}`} className={className} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "16 / 9", background: "#050506" }} />;
}
