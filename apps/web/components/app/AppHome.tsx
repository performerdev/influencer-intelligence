"use client";

import { useEffect, useMemo, useState } from "react";

import { UsageMeter } from "@/components/account/AuthProvider";
import { type ChatHistory, ChatView } from "@/components/chat/ChatView";
import { Coin } from "@/components/early/Coin";
import { Ticker } from "@/components/early/Ticker";
import { early } from "@/config/early";
import { getLenis } from "@/components/layout/SmoothScroll";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { callRows } from "@/lib/calls";
import { type ApiBrain, toChatBrain } from "@/lib/chat-brain";
import type { Intelligence } from "@/lib/intelligences";

import { CallsDashboard } from "./CallsDashboard";
import { Tools } from "./Tools";

export type RecentChat = { id: string; kind: "single" | "group"; handles: string[]; title: string; updatedAt: string };
type Mode = "ask" | "check" | "bag";

const MODES: { id: Mode; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "check", label: "Check a coin" },
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
export function AppHome({ intelligences }: { intelligences: Intelligence[] }) {
  const [handle, setHandle] = useState(intelligences[0]?.handle ?? "");
  // your chats load after the page; the open one stays highlighted, and its id is in the address (/?c=<id>)
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatHistory | null>(null);
  const [opening, setOpening] = useState(false);
  // a new value remounts the conversation: a fresh chat, or a saved one
  const [session, setSession] = useState(0);
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

  // reopen on the last mind you used, or on the chat in the address
  useEffect(() => {
    const loadList = () =>
      fetch("/api/chats")
        .then((r) => (r.ok ? (r.json() as Promise<{ chats: RecentChat[] }>) : { chats: [] }))
        .then((j) => setRecent(j.chats ?? []))
        .catch(() => {});
    const c = new URLSearchParams(window.location.search).get("c");
    if (c && /^[0-9a-f-]{36}$/i.test(c)) {
      // the open chat first, the list after it
      void openChat({ id: c, kind: "single", handles: [], title: "", updatedAt: "" }).then(loadList);
    } else {
      try {
        const h = localStorage.getItem(STORE);
        if (h && intelligences.some((i) => i.handle === h)) setHandle(h);
      } catch {}
      void loadList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelligences]);

  const setAddress = (c: string | null) => {
    try {
      window.history.replaceState(window.history.state, "", c ? `/?c=${c}` : "/");
    } catch {}
  };

  /** Continue a saved chat right here, with its mind selected. */
  async function openChat(c: RecentChat) {
    setActive(c.id);
    setRailOpen(false);
    setMode("ask");
    setView("chat");
    setAddress(c.id);
    if (c.handles[0]) setHandle(c.handles[0]);
    setOpening(true);
    const h = await fetch(`/api/chats/${c.id}`)
      .then((r) => (r.ok ? (r.json() as Promise<ChatHistory & { kind: string; handles: string[] }>) : null))
      .catch(() => null);
    if (h && h.kind === "single" && h.handles[0]) {
      setHandle(h.handles[0]);
      setHistory({ chatId: h.chatId, items: h.items });
    } else {
      // gone (older than your plan keeps) or not yours: a fresh chat instead
      setActive(null);
      setHistory(null);
      setAddress(null);
    }
    setSession((n) => n + 1);
    setOpening(false);
  }

  /** A fresh chat with this mind. */
  const newChat = (h: string) => {
    setHandle(h);
    setActive(null);
    setHistory(null);
    setSession((n) => n + 1);
    setAddress(null);
  };

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
  // the coins this mind calls most: one-tap examples in the tools
  const examples = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows) n.set(r.ticker, (n.get(r.ticker) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  }, [rows]);

  const pick = (h: string) => {
    newChat(h);
    setRailOpen(false);
    setView("chat");
  };

  if (!it) return null;
  const chatIt = { code: it.code, handle: it.handle, displayName: it.displayName, color: it.color, avatar: it.avatar, postsParsed: it.postsParsed, postsPerDay: it.postsPerDay };

  return (
    <div className="fixed inset-0 z-40 grid grid-rows-[minmax(0,1fr)] bg-void pt-topbar xl:grid-cols-[248px_minmax(0,1fr)_380px] lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* ── left: minds and chats ── */}
      {railOpen && <button type="button" aria-label="Close" className="fixed inset-0 z-[55] bg-black/60 lg:hidden" onClick={() => setRailOpen(false)} />}
      <aside
        aria-label="Minds and chats"
        className={`fixed inset-y-0 left-0 z-[60] flex w-[min(300px,86vw)] flex-col border-r border-line bg-void transition-transform duration-base ease-ii-out lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${railOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-2.5 py-4">
          <AppLink
            href="/early"
            className="mb-4 grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-chip border border-dashed border-line-hover px-2 py-1.5 transition-colors duration-fast hover:bg-panel"
          >
            <Coin size={32} />
            <span className="min-w-0">
              <span className="block font-mono text-[10px] leading-tight text-particle">ii-00 · Early</span>
              <span className="block truncate font-pixel text-sm leading-tight">
                Get {early.base.toLocaleString("en-US")} <Ticker />
              </span>
            </span>
          </AppLink>
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
                  // start loading the brain while the pointer is still on its way
                  onPointerEnter={() => void fetchBrain(m.handle)}
                  onFocus={() => void fetchBrain(m.handle)}
                  aria-current={m.handle === handle && !active}
                  className={`grid w-full grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-chip border px-2 py-1.5 text-left transition-colors duration-fast ${
                    m.handle === handle ? (active ? "border-transparent bg-panel/60" : "border-line bg-panel") : "border-transparent hover:bg-panel"
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
              <p className="mb-1 mt-6 flex items-center justify-between px-2 font-pixel text-[11px] text-muted">
                <span>Recent chats</span>
                <button type="button" onClick={() => pick(handle)} className="text-muted transition-colors duration-fast hover:text-ceramic">
                  + New chat
                </button>
              </p>
              <ul>
                {recent.slice(0, 12).map((c) => {
                  const label = (
                    <>
                      {c.title || "Untitled"}
                      <span className="ml-1.5 font-pixel text-[10px] text-muted">{c.kind === "group" ? `group · ${c.handles.length}` : `@${c.handles[0]}`}</span>
                    </>
                  );
                  const cls = "block w-full truncate rounded-chip border px-2 py-1.5 text-left text-sm transition-colors duration-fast";
                  return (
                    <li key={c.id}>
                      {c.kind === "group" ? (
                        <AppLink href={`/group?c=${c.id}`} className={`${cls} border-transparent text-particle hover:bg-panel hover:text-ceramic`}>
                          {label}
                        </AppLink>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void openChat(c)}
                          aria-current={active === c.id}
                          className={`${cls} ${active === c.id ? "border-line bg-panel text-ceramic" : "border-transparent text-particle hover:bg-panel hover:text-ceramic"}`}
                        >
                          {label}
                        </button>
                      )}
                    </li>
                  );
                })}
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

        <div className={`min-h-0 flex-1 flex-col ${view === "calls" ? "hidden xl:flex" : "flex"}`}>
          {ready === undefined || opening ? (
            <p className="px-gutter py-10 font-pixel text-xs text-muted lg:px-8">{opening ? "Opening your chat…" : `Loading @${it.handle}'s brain…`}</p>
          ) : mode === "ask" ? (
            <ChatView
              key={`${it.handle}:${session}`}
              embedded
              intelligence={chatIt}
              brain={chatBrain}
              history={history?.chatId === active ? history : null}
              onChat={(id, title) => {
                setActive(id);
                setAddress(id);
                setRecent((r) => [{ id, kind: "single", handles: [it.handle], title, updatedAt: new Date().toISOString() }, ...r.filter((x) => x.id !== id)]);
              }}
            />
          ) : ready ? (
            <Tools key={`${it.handle}-${mode}`} mode={mode} mind={{ handle: it.handle, code: it.code, color: it.color }} examples={examples} />
          ) : (
            <p className="px-gutter py-10 text-sm text-muted lg:px-8">@{it.handle}&apos;s brain is still being built. The tools open once it&apos;s ready.</p>
          )}
        </div>
        {view === "calls" && (
          <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-gutter py-5 xl:hidden">
            {ready ? <CallsDashboard handle={it.handle} color={it.color} rows={rows} calls={ready.files.calls} stats={ready.files.stats} /> : <p className="text-sm text-muted">No call record yet.</p>}
          </div>
        )}
      </section>

      {/* ── right: the call record ── */}
      <aside data-lenis-prevent aria-label={`@${it.handle}'s calls`} className="hidden min-h-0 overflow-y-auto border-l border-line px-5 py-5 xl:block">
        {ready ? <CallsDashboard handle={it.handle} color={it.color} rows={rows} calls={ready.files.calls} stats={ready.files.stats} /> : <p className="font-pixel text-xs text-muted">{ready === null ? "No call record yet." : "Loading…"}</p>}
      </aside>
    </div>
  );
}
