"use client";

import { useEffect, useMemo, useState } from "react";

import { UsageMeter } from "@/components/account/AuthProvider";
import { ChatView } from "@/components/chat/ChatView";
import { getLenis } from "@/components/layout/SmoothScroll";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { callRows } from "@/lib/calls";
import { type ApiBrain, toChatBrain } from "@/lib/chat-brain";
import type { Intelligence } from "@/lib/intelligences";

import { CallsDashboard } from "./CallsDashboard";
import { Tools } from "./Tools";

export type RecentChat = { id: string; kind: "single" | "group"; handles: string[]; title: string; updatedAt: string };
type Mode = "ask" | "plan" | "bag";

const MODES: { id: Mode; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "plan", label: "Trade plan" },
  { id: "bag", label: "Rate my bag" },
];
const STORE = "ii.app.mind";

/* one fetch per mind per page view */
const brains = new Map<string, Promise<ApiBrain | null>>();
function fetchBrain(handle: string) {
  const key = handle.toLowerCase();
  if (!brains.has(key))
    brains.set(
      key,
      fetch(`/api/brain/${encodeURIComponent(handle)}?lite=1`)
        .then((r) => (r.ok ? (r.json() as Promise<ApiBrain>) : null))
        .catch(() => (brains.delete(key), null)),
    );
  return brains.get(key)!;
}

/**
 * "/" for a logged-in visitor: a workspace. Minds and recent chats on the left,
 * the conversation (or a tool) in the middle, the mind's call record on the right.
 */
export function AppHome({ intelligences, recent }: { intelligences: Intelligence[]; recent: RecentChat[] }) {
  const [handle, setHandle] = useState(intelligences[0]?.handle ?? "");
  const [mode, setMode] = useState<Mode>("ask");
  const [view, setView] = useState<"chat" | "calls">("chat");
  const [railOpen, setRailOpen] = useState(false);
  const [brain, setBrain] = useState<{ handle: string; data: ApiBrain | null } | null>(null);

  // the workspace fills the window: the page itself doesn't scroll while it's open
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    getLenis()?.stop();
    return () => {
      html.style.overflow = prev;
      getLenis()?.start();
    };
  }, []);

  // reopen on the last mind you used
  useEffect(() => {
    try {
      const h = localStorage.getItem(STORE);
      if (h && intelligences.some((i) => i.handle === h)) setHandle(h);
    } catch {}
  }, [intelligences]);

  useEffect(() => {
    if (!handle) return;
    let live = true;
    try {
      localStorage.setItem(STORE, handle);
    } catch {}
    fetchBrain(handle).then((data) => live && setBrain({ handle, data }));
    return () => {
      live = false;
    };
  }, [handle]);

  const it = intelligences.find((i) => i.handle === handle) ?? intelligences[0];
  const ready = brain?.handle === handle ? brain.data : undefined; // undefined = loading, null = no brain yet
  const chatBrain = useMemo(() => (ready ? toChatBrain(ready) : null), [ready]);
  const rows = useMemo(() => (ready ? callRows(ready.files) : []), [ready]);

  const pick = (h: string) => {
    setHandle(h);
    setRailOpen(false);
    setView("chat");
  };

  if (!it) return null;
  const chatIt = { code: it.code, handle: it.handle, displayName: it.displayName, color: it.color, avatar: it.avatar, postsParsed: it.postsParsed, postsPerDay: it.postsPerDay };

  return (
    <div className="fixed inset-0 z-40 grid bg-void pt-topbar xl:grid-cols-[248px_minmax(0,1fr)_380px] lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* ── left: minds and chats ── */}
      {railOpen && <button type="button" aria-label="Close" className="fixed inset-0 z-[55] bg-black/60 lg:hidden" onClick={() => setRailOpen(false)} />}
      <aside
        aria-label="Minds and chats"
        className={`fixed inset-y-0 left-0 z-[60] flex w-[min(300px,86vw)] flex-col border-r border-line bg-void transition-transform duration-base ease-ii-out lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${railOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-2.5 py-4">
          <p className="mb-2 flex justify-between px-2 font-pixel text-[11px] text-muted">
            <span>Minds</span>
            <span className="tabular-nums">{intelligences.length}</span>
          </p>
          <ul>
            {intelligences.map((m) => (
              <li key={m.code}>
                <button
                  type="button"
                  onClick={() => pick(m.handle)}
                  aria-current={m.handle === handle}
                  className={`grid w-full grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-chip border px-2 py-1.5 text-left transition-colors duration-fast ${
                    m.handle === handle ? "border-line bg-panel" : "border-transparent hover:bg-panel"
                  }`}
                >
                  <BrainAvatar it={m} size={32} active={m.handle === handle} />
                  <span className="min-w-0">
                    <span className="block font-mono text-[10px] leading-tight" style={{ color: m.color }}>
                      {m.code}
                    </span>
                    <span className="block truncate font-pixel text-sm leading-tight">@{m.handle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-1 px-2">
            <AppLink href="/group" className="link-quiet py-1 text-xs">
              + Group chat
            </AppLink>
            <AppLink href="/add" className="link-quiet py-1 text-xs">
              + Add a mind
            </AppLink>
          </div>

          {recent.length > 0 && (
            <>
              <p className="mb-1 mt-6 px-2 font-pixel text-[11px] text-muted">Recent chats</p>
              <ul>
                {recent.slice(0, 12).map((c) => (
                  <li key={c.id}>
                    <AppLink
                      href={c.kind === "group" ? `/group?c=${c.id}` : `/i/${c.handles[0]}?c=${c.id}`}
                      className="block truncate rounded-chip px-2 py-1.5 text-sm text-particle transition-colors duration-fast hover:bg-panel hover:text-ceramic"
                    >
                      {c.title || "Untitled"}
                      <span className="ml-1.5 font-pixel text-[10px] text-muted">{c.kind === "group" ? `group · ${c.handles.length}` : `@${c.handles[0]}`}</span>
                    </AppLink>
                  </li>
                ))}
              </ul>
              <AppLink href="/account" className="link-quiet mt-1 block px-2 py-1 text-xs">
                All chats <span className="arrow">↗</span>
              </AppLink>
            </>
          )}
        </div>
        <div className="border-t border-line px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <UsageMeter className="flex-wrap !gap-2" />
        </div>
      </aside>

      {/* ── middle: the conversation or a tool ── */}
      <section className="flex min-h-0 min-w-0 flex-col" aria-label={`@${it.handle}`}>
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-gutter py-3 lg:px-6">
          <button type="button" onClick={() => setRailOpen(true)} className="btn-line h-9 shrink-0 px-3 text-xs lg:hidden">
            Minds
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <BrainAvatar it={it} size={44} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs" style={{ color: it.color }}>
                  {it.code}
                </span>
                <h1 className="truncate font-pixel text-body">@{it.handle}</h1>
              </div>
              <p className="truncate text-xs text-particle">{it.oneLineMind ?? "Unofficial AI model built from public posts."}</p>
            </div>
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
            <div role="tablist" aria-label="Mode" className="flex rounded-chip border border-line">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  type="button"
                  aria-selected={mode === m.id}
                  onClick={() => {
                    setMode(m.id);
                    setView("chat");
                  }}
                  className={`px-3 py-1.5 font-pixel text-xs transition-colors duration-fast ${mode === m.id ? "bg-ceramic text-void" : "text-muted hover:text-ceramic"} ${m.id !== "ask" ? "border-l border-line" : ""}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setView(view === "chat" ? "calls" : "chat")} className="btn-line h-8 shrink-0 px-3 text-xs xl:hidden">
              {view === "chat" ? "Calls" : "Chat"}
            </button>
          </div>
        </header>

        <div className={`min-h-0 flex-1 ${view === "calls" ? "hidden xl:block" : ""}`}>
          {ready === undefined ? (
            <p className="px-gutter py-10 font-pixel text-xs text-muted lg:px-8">Loading @{it.handle}&apos;s brain…</p>
          ) : mode === "ask" ? (
            <ChatView key={it.handle} embedded intelligence={chatIt} brain={chatBrain} />
          ) : ready ? (
            <Tools key={`${it.handle}-${mode}`} mode={mode} handle={it.handle} rows={rows} rules={ready.files.rules} medianHold={ready.files.stats?.median_hold_days ?? null} />
          ) : (
            <p className="px-gutter py-10 text-sm text-muted lg:px-8">@{it.handle}&apos;s brain is still being built. The tools open once it&apos;s ready.</p>
          )}
        </div>
        {view === "calls" && (
          <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-gutter py-5 xl:hidden">
            {ready ? <CallsDashboard handle={it.handle} color={it.color} rows={rows} stats={ready.files.stats} /> : <p className="text-sm text-muted">No call record yet.</p>}
          </div>
        )}
      </section>

      {/* ── right: the call record ── */}
      <aside data-lenis-prevent aria-label={`@${it.handle}'s calls`} className="hidden min-h-0 overflow-y-auto border-l border-line px-5 py-5 xl:block">
        {ready ? <CallsDashboard handle={it.handle} color={it.color} rows={rows} stats={ready.files.stats} /> : <p className="font-pixel text-xs text-muted">{ready === null ? "No call record yet." : "Loading…"}</p>}
      </aside>
    </div>
  );
}
