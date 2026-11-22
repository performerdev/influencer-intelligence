"use client";

import { useMemo, useState } from "react";

import { MindCard } from "@/components/home/IntelligencesSection";
import { AppLink } from "@/components/ui/AppLink";
import type { Intelligence } from "@/lib/intelligences";

type Sort = "popular" | "new" | "calls";
const SORTS: { id: Sort; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "new", label: "New" },
  { id: "calls", label: "Most calls" },
];

/** Every community mind: search, three ways to sort, the same cards as the home page. */
export function CommunityBrowser({ minds }: { minds: Intelligence[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const list = useMemo(() => {
    const needle = q.trim().replace(/^@/, "").toLowerCase();
    const found = needle
      ? minds.filter((m) => m.handle.toLowerCase().includes(needle) || (m.oneLineMind ?? "").toLowerCase().includes(needle) || (m.addedBy ?? "").toLowerCase().includes(needle))
      : minds;
    const by: Record<Sort, (a: Intelligence, b: Intelligence) => number> = {
      popular: (a, b) => (b.people ?? 0) - (a.people ?? 0) || (b.addedAt ?? "").localeCompare(a.addedAt ?? ""),
      new: (a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""),
      calls: (a, b) => (b.calls ?? 0) - (a.calls ?? 0) || (b.people ?? 0) - (a.people ?? 0),
    };
    return [...found].sort(by[sort]);
  }, [minds, q, sort]);

  if (minds.length === 0)
    return (
      <div className="rounded-panel border border-dashed border-line px-6 py-14 text-center">
        <p className="font-pixel text-body text-ceramic">No community minds yet.</p>
        <p className="mt-2 text-sm text-particle">Be the first: add anyone on X and it shows up here once it&apos;s built.</p>
        <AppLink href="/add" className="btn-line mt-6">
          + Add a mind
        </AppLink>
      </div>
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-0 flex-[1_1_240px]">
          <span className="sr-only">Search community minds</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${minds.length} minds, by @handle or who added it`}
            spellCheck={false}
            autoComplete="off"
            className="h-10 w-full rounded-input border border-line bg-panel px-3.5 font-pixel text-sm text-ceramic placeholder:text-muted focus:border-line-hover focus:outline-none"
          />
        </label>
        <div role="tablist" aria-label="Sort" className="flex rounded-chip border border-line">
          {SORTS.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={sort === s.id}
              onClick={() => setSort(s.id)}
              className={`px-3 py-2 font-pixel text-xs transition-colors duration-fast ${sort === s.id ? "bg-ceramic text-void" : "text-muted hover:text-ceramic"} ${i ? "border-l border-line" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No mind matches “{q.trim()}”.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-3 min-[1080px]:grid-cols-4">
          {list.map((it) => (
            <MindCard key={it.code} it={it} />
          ))}
        </ul>
      )}
    </>
  );
}
