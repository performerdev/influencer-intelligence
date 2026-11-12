"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** The two things Early Mind's tasks point at: the project's X account and the launch post. */
export function EarlySettings({ xHandle, launchUrl }: { xHandle: string; launchUrl: string }) {
  const router = useRouter();
  const [h, setH] = useState(xHandle);
  const [u, setU] = useState(launchUrl);
  const [state, setState] = useState<{ busy?: boolean; error?: string; saved?: boolean }>({});
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ busy: true });
    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "early-settings", xHandle: h, launchUrl: u }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string } | null;
    if (!r?.ok) return setState({ error: j?.error ?? "Didn't save." });
    setState({ saved: true });
    router.refresh();
  };
  const field = "h-10 w-full rounded-input border border-line bg-void px-3 font-pixel text-sm text-ceramic placeholder:text-muted focus:border-line-hover focus:outline-none";
  return (
    <form onSubmit={save} className="grid gap-3 rounded-panel border border-line bg-panel p-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
      <label className="grid gap-1.5">
        <span className="label-mono">Project X account (follow task)</span>
        <input id="early-x-handle" className={field} value={h} onChange={(e) => setH(e.target.value)} placeholder="handle, without @" autoComplete="off" />
      </label>
      <label className="grid gap-1.5">
        <span className="label-mono">Launch post (repost and reply tasks)</span>
        <input id="early-launch-url" className={field} value={u} onChange={(e) => setU(e.target.value)} placeholder="https://x.com/handle/status/…" autoComplete="off" />
      </label>
      <button type="submit" disabled={state.busy} className="btn-ceramic h-10 px-4 text-sm">
        {state.busy ? "Saving…" : state.saved ? "Saved" : "Save"}
      </button>
      {state.error && <p className="text-sm md:col-span-3" style={{ color: "var(--ii-verdict-sell)" }}>{state.error}</p>}
      <p className="text-xs text-muted md:col-span-3">Live within 30 seconds, no deploy. Until the launch post is set, the repost task opens the project&apos;s profile and any reply link from the person counts.</p>
    </form>
  );
}
