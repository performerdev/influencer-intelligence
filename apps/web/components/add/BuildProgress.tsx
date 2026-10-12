"use client";

import { useEffect, useState } from "react";

import { TypingIndicator } from "@/components/chat/bits";
import { AppLink } from "@/components/ui/AppLink";
import { formatCount } from "@/lib/intelligences";

type Job = { id: string; handle: string; status: string; progress: Record<string, any>; quoteUsd: number | null; error: string | null; createdAt: string; finishedAt: string | null };

const STEPS = [
  ["awaiting_payment", "Payment"],
  ["queued", "In the queue"],
  ["parsing", "Reading posts"],
  ["distilling", "Distilling the mind"],
  ["building", "Building the brain"],
  ["ready", "Live"],
] as const;
const order = (s: string) => {
  const i = STEPS.findIndex(([k]) => k === s);
  return i < 0 ? 0 : i;
};

/** Live progress of one build, polled every few seconds. */
export function BuildProgress({ initial }: { initial: Job }) {
  const [job, setJob] = useState<Job>(initial);

  useEffect(() => {
    if (["ready", "failed", "refunded"].includes(job.status)) return;
    const t = setInterval(async () => {
      const j = await fetch(`/api/add/status?id=${job.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (j) setJob(j);
    }, 5000);
    return () => clearInterval(t);
  }, [job.id, job.status]);

  const now = order(job.status);
  const p = job.progress ?? {};

  if (job.status === "failed" || job.status === "refunded")
    return (
      <div className="rounded-panel border border-line bg-panel p-6">
        <p className="font-pixel text-body text-ceramic">{job.status === "refunded" ? "Refunded." : "The build hit a problem."}</p>
        <p className="mt-2 text-sm text-particle">{job.status === "refunded" ? "The payment was sent back to your wallet." : "Nothing for you to do — we'll rebuild it or refund you, and this page updates when we do."}</p>
      </div>
    );

  return (
    <div className="space-y-8">
      <ol className="space-y-3">
        {STEPS.map(([key, label], i) => {
          const state = i < now ? "done" : i === now ? "now" : "next";
          return (
            <li key={key} className="flex items-center gap-3">
              <span
                className="h-3 w-3 shrink-0"
                style={{ background: state === "done" ? "var(--ii-particle)" : state === "now" ? "var(--ii-ceramic)" : "var(--ii-line)" }}
                aria-hidden
              />
              <span className={`font-pixel text-sm ${state === "next" ? "text-muted" : "text-ceramic"}`}>{label}</span>
              {state === "now" && job.status !== "ready" && <TypingIndicator />}
              {state === "now" && key === "parsing" && p.kept != null && <span className="font-mono text-xs text-muted">{formatCount(Number(p.kept))} posts so far</span>}
              {state === "now" && key === "distilling" && p.total ? <span className="font-mono text-xs text-muted">{p.done}/{p.total}</span> : null}
            </li>
          );
        })}
      </ol>

      {job.status === "ready" ? (
        <AppLink href={`/i/${job.handle}`} className="btn-ceramic">
          Talk to @{job.handle} →
        </AppLink>
      ) : (
        <p className="text-sm text-muted">
          {job.status === "awaiting_payment"
            ? "Waiting for the payment to land on Solana."
            : "You can leave this page — the brain goes live on the home page as soon as it's built, and this page shows it too."}
        </p>
      )}
    </div>
  );
}
