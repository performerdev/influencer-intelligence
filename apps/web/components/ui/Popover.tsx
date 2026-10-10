"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Minimal popover: click to toggle, Esc / outside click to close. */
export function Popover({
  trigger,
  children,
  align = "end",
  triggerClassName,
  label,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  triggerClassName?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <div
        id={id}
        role="dialog"
        aria-label={label}
        hidden={!open}
        className={`absolute top-[calc(100%+10px)] z-50 w-72 rounded-panel border border-line bg-panel p-4 ${
          align === "end" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
