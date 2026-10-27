"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Jump to a coin's page by its ticker. */
export function CoinSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = () => {
    const t = q.trim().replace(/^\$/, "").toUpperCase();
    if (/^[A-Z0-9]{1,15}$/.test(t)) router.push(`/coin/${encodeURIComponent(t)}`);
  };
  return (
    <form
      role="search"
      className="flex items-center gap-2 rounded-input border border-line bg-panel p-1.5 focus-within:border-line-hover"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <label htmlFor="coin-q" className="pl-2 font-pixel text-sm text-muted">
        $
      </label>
      <input
        id="coin-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Any ticker: WIF, HYPE, BTC"
        maxLength={16}
        autoComplete="off"
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent py-1.5 font-pixel text-sm uppercase placeholder:normal-case placeholder:text-muted focus:outline-none"
      />
      <button type="submit" disabled={!q.trim()} className="btn-ceramic h-9 px-4 text-xs disabled:opacity-40">
        Look up
      </button>
    </form>
  );
}
