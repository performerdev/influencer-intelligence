"use client";

export type Period = "all" | "30d";

/** All time / Last 30 days — the same switch in the app and on a mind's page. */
export function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex shrink-0 border border-line" role="group" aria-label="Period">
      {(
        [
          ["all", "All time"],
          ["30d", "Last 30 days"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`whitespace-nowrap px-2.5 py-1 font-pixel text-xs transition-colors duration-fast ${value === v ? "bg-particle text-void" : "text-muted hover:text-ceramic"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
