"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** One admin action; refreshes the page when it's done. */
export function AdminButton({ action, id, handle, label, confirm, small }: { action: string; id?: string; handle?: string; label: string; confirm?: boolean; small?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const run = async () => {
    // a second click confirms the ones that change what visitors see
    if (confirm && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setBusy(true);
    await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, handle }) }).catch(() => null);
    setBusy(false);
    setArmed(false);
    router.refresh();
  };
  return (
    <button onClick={run} disabled={busy} className={small ? "font-pixel text-xs text-muted underline decoration-line-hover underline-offset-4 hover:text-ceramic" : "btn-line h-8 px-3 text-xs"}>
      {busy ? "…" : armed ? "Click again to confirm" : label}
    </button>
  );
}
