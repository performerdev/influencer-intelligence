"use client";

import { Fragment, useEffect, useRef } from "react";

/* ───────────────────────── typing indicator ───────────────────────── */

/** The AI is "thinking": a 12×12 cluster of points that breathes. */
export function TypingIndicator({ size = 14 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = size * dpr;
    ctx.scale(dpr, dpr);
    const pts = Array.from({ length: 26 }, (_, i) => {
      const a = i * 2.399963;
      const r = Math.sqrt((i + 0.5) / 26) * 0.5;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, p: Math.random() * Math.PI * 2 };
    });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, size, size);
      const breathe = reduced ? 1 : 0.86 + 0.14 * Math.sin(t / 420);
      ctx.fillStyle = "#B9B8B2";
      for (const p of pts) {
        const j = reduced ? 0 : Math.sin(t / 300 + p.p) * 0.04;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t / 500 + p.p) ** 2;
        ctx.fillRect(size / 2 + (p.x + j) * size * breathe - 0.6, size / 2 + (p.y - j) * size * breathe - 0.6, 1.2, 1.2);
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={ref} aria-label="Thinking" role="img" style={{ width: size, height: size }} className="inline-block align-middle" />;
}

/* ───────────────────────── verdict chip ───────────────────────── */

export type Verdict = "BUY" | "SELL" | "HOLD" | "PASS";

/** The only place the green and red exist on the site. */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const style =
    verdict === "BUY"
      ? { color: "var(--ii-verdict-buy)", borderColor: "color-mix(in srgb, var(--ii-verdict-buy) 45%, transparent)" }
      : verdict === "SELL"
        ? { color: "var(--ii-verdict-sell)", borderColor: "color-mix(in srgb, var(--ii-verdict-sell) 45%, transparent)" }
        : { color: "var(--ii-ceramic)", borderColor: "var(--ii-line-hover)" };
  return (
    <span className="verdict-pop inline-flex h-7 items-center rounded-pill border px-3 font-mono text-xs font-medium tracking-[0.08em]" style={style}>
      {verdict}
    </span>
  );
}

/* ───────────────────────── tiny markdown ───────────────────────── */

/** Enough markdown for brain files: headings, bullets, bold, paragraphs. Citations are muted. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (/^#{1,3}\s/.test(lines[0]) && lines.length === 1) {
          const level = lines[0].match(/^#+/)![0].length;
          const t = lines[0].replace(/^#+\s*/, "");
          return level === 1 ? (
            <h3 key={i} className="mb-3 mt-6 text-h3 font-medium first:mt-0">{inline(t)}</h3>
          ) : (
            <h4 key={i} className="mb-2 mt-5 text-body font-medium text-ceramic first:mt-0">{inline(t)}</h4>
          );
        }
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l) || /^#{1,3}\s/.test(l))) {
          return (
            <Fragment key={i}>
              {lines.filter((l) => /^#{1,3}\s/.test(l)).map((h, k) => (
                <h4 key={`h${k}`} className="mb-2 mt-5 text-body font-medium text-ceramic">{inline(h.replace(/^#+\s*/, ""))}</h4>
              ))}
              <ul className="my-2 space-y-1.5 pl-4">
                {lines.filter((l) => !/^#{1,3}\s/.test(l)).map((l, k) => (
                  <li key={k} className="list-disc marker:text-muted">{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ""))}</li>
                ))}
              </ul>
            </Fragment>
          );
        }
        return (
          <p key={i} className="my-2">
            {lines.map((l, k) => (
              <Fragment key={k}>
                {k > 0 && <br />}
                {/^#{1,3}\s/.test(l) ? <strong className="font-medium text-ceramic">{inline(l.replace(/^#+\s*/, ""))}</strong> : inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|\(post:\d+\)|\[post:\d+\])/g).map((part, i) => {
    if (/^\*\*.*\*\*$/.test(part)) return <strong key={i} className="font-medium text-ceramic">{part.slice(2, -2)}</strong>;
    if (/^[([]post:\d+[)\]]$/.test(part)) return <span key={i} className="font-mono text-[0.85em] text-muted">{part}</span>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/* ───────────────────────── sheet / drawer ───────────────────────── */

/** Right drawer on desktop, bottom sheet on mobile. Esc and backdrop close it. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = "right",
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  side?: "right" | "bottom";
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const pos =
    side === "right"
      ? `inset-y-0 right-0 w-full ${wide ? "md:w-[min(760px,92vw)]" : "md:w-[420px]"} border-l sheet-in-right`
      : "inset-x-0 bottom-0 max-h-[85svh] rounded-t-card border-t sheet-in-up";
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <button aria-label="Close" className="absolute inset-0 bg-void/70" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className={`absolute flex flex-col border-line bg-panel outline-none ${pos}`}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0 text-sm font-medium">{title}</div>
          <button onClick={onClose} className="rounded-pill px-2 py-1 font-mono text-label uppercase text-muted transition-colors duration-fast hover:text-ceramic">
            Esc
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">{children}</div>
      </div>
    </div>
  );
}
