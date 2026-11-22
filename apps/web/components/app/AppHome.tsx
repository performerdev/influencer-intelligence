"use client";

import { useEffect, useMemo, useState } from "react";

import { UsageMeter } from "@/components/account/AuthProvider";
import { type ChatHistory, ChatView } from "@/components/chat/ChatView";
import { Ticker } from "@/components/early/Ticker";
import { MindStack } from "@/components/home/MindStack";
import { AddBrain } from "@/components/particles/AddBrain";
import { getLenis } from "@/components/layout/SmoothScroll";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { community } from "@/config/community";
import { callRows } from "@/lib/calls";
import { type ApiBrain, toChatBrain } from "@/lib/chat-brain";
import { type Intelligence, isCommunity, isMain } from "@/lib/intelligences";

import { type AllHistory, AllMinds } from "./AllMinds";
import { CallsDashboard } from "./CallsDashboard";
import { Tools } from "./Tools";

export type RecentChat = { id: string; kind: "single" | "group" | "all"; handles: string[]; title: string; updatedAt: string };
type Mode = "ask" | "check" | "bag";

const MODES: { id: Mode; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "check", label: "Check a coin" },
  { id: "bag", label: "Rate my bag" },
];
const STORE = "ii.app.mind";
/** what STORE holds while "All minds" is open */
const ALL = "__all";

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
  const [addHover, setAddHover] = useState(false);
  // "All minds": one question to every mind, instead of one chosen mind
  const [all, setAll] = useState(false);
  const [allHistory, setAllHistory] = useState<AllHistory | null>(null);

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
        if (h === ALL) setAll(true);
        else if (h && intelligences.some((i) => i.handle === h)) setHandle(h);
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
    if (h && h.kind === "all") {
      setAll(true);
      setAllHistory({ chatId: h.chatId, items: h.items as unknown as AllHistory["items"] });
    } else if (h && h.kind === "single" && h.handles[0]) {
      setAll(false);
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
    setAll(false);
    setHandle(h);
    setActive(null);
    setHistory(null);
    setSession((n) => n + 1);
    setAddress(null);
  };

  /** A fresh "All minds" conversation. */
  const openAll = () => {
    setAll(true);
    setAllHistory(null);
    setActive(null);
    setSession((n) => n + 1);
    setAddress(null);
    setRailOpen(false);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORE, all ? ALL : handle);
    } catch {}
  }, [all, handle]);

  useEffect(() => {
    if (!handle) return;
    let live = true;
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

  // Main minds first; minds people added under 100k followers sit in their own Community list
  const main = useMemo(() => intelligences.filter(isMain), [intelligences]);
  const communityMinds = useMemo(() => intelligences.filter(isCommunity), [intelligences]);

  if (!it) return null;
  const chatIt = { code: it.code, handle: it.handle, displayName: it.displayName, color: it.color, avatar: it.avatar, postsParsed: it.postsParsed, postsPerDay: it.postsPerDay };

  return (
    <div className="fixed inset-0 z-40 grid grid-rows-[minmax(0,1fr)] bg-void pt-topbar xl:grid-cols-[248px_minmax(0,1fr)_380px] lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* ── left: minds and chats ── */}
      {railOpen && <button type="button" aria-label="Close" className="fixed inset-0 z-[55] bg-black/60 lg:hidden" onClick={() => setRailOpen(false)} />}
      <aside
        aria-label="Minds and chats"
        className={`fixed inset-y-0 left-0 z-[60] flex w-[min(300px,86vw)] flex-col border-r border-line bg-void pt-topbar lg:pt-0 transition-transform duration-base ease-ii-out lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${railOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-2.5 py-4">
          <button
            type="button"
            onClick={openAll}
            aria-current={all && !active}
            className={`mb-4 flex w-full items-center justify-between gap-3 rounded-chip border px-2 py-2 text-left transition-colors duration-fast ${all ? "border-line bg-panel" : "border-line border-dashed hover:bg-panel"}`}
          >
            <span className="min-w-0">
              <span className="block font-pixel text-sm leading-tight text-ceramic">All minds</span>
              <span className="block truncate text-[11px] leading-tight text-muted">One question, every mind</span>
            </span>
            <MindStack minds={main} size={22} />
          </button>
          <p className="mb-2 flex justify-between px-2 font-pixel text-[11px] text-muted">
            <span>Minds</span>
            <span className="tabular-nums">{main.length}</span>
          </p>
          <ul>
            {main.map((m) => (
              <li key={m.code}>
                <MindRow m={m} selected={!all && m.handle === handle} active={active} onPick={pick} />
              </li>
            ))}
          </ul>
          <CommunityList minds={communityMinds} selected={all ? null : handle} active={active} onPick={pick} />
          <div className="mt-3 grid gap-1">
            <AppLink href="/group" className="flex items-center justify-between gap-3 rounded-chip border border-transparent px-2 py-2 transition-colors duration-fast hover:border-line hover:bg-panel">
              <span className="min-w-0">
                <span className="block font-pixel text-sm leading-tight text-ceramic">+ Group chat</span>
                <span className="block truncate text-[11px] leading-tight text-muted">2 to 4 minds in one room</span>
              </span>
              <MindStack minds={main} size={22} />
            </AppLink>
            <AppLink
              href="/add"
              onPointerEnter={() => setAddHover(true)}
              onPointerLeave={() => setAddHover(false)}
              className="flex items-center justify-between gap-3 rounded-chip border border-transparent px-2 py-2 transition-colors duration-fast hover:border-line hover:bg-panel"
            >
              <span className="min-w-0">
                <span className="block font-pixel text-sm leading-tight text-ceramic">+ Add a mind</span>
                <span className="block truncate text-[11px] leading-tight text-muted">Anyone on X, built for you</span>
              </span>
              <AddBrain size={30} colors={main.map((m) => m.color)} active={addHover} />
            </AppLink>
          </div>

          {recent.length > 0 && (
            <>
              <p className="mb-1 mt-6 flex items-center justify-between px-2 font-pixel text-[11px] text-muted">
                <span>Recent chats</span>
                <button type="button" onClick={() => (all ? openAll() : pick(handle))} className="text-muted transition-colors duration-fast hover:text-ceramic">
                  + New chat
                </button>
              </p>
              <ul>
                {recent.slice(0, 12).map((c) => {
                  const label = (
                    <>
                      {c.title || "Untitled"}
                      <span className="ml-1.5 font-pixel text-[10px] text-muted">{c.kind === "group" ? `group · ${c.handles.length}` : c.kind === "all" ? "all minds" : `@${c.handles[0]}`}</span>
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

      {all && (
        <>
          {/* ── middle: All minds ── */}
          <section className="flex min-h-0 min-w-0 flex-col" aria-label="All minds">
            <header className="flex items-center gap-x-4 border-b border-line px-gutter py-3 lg:px-6">
              <button type="button" onClick={() => setRailOpen(true)} className="btn-line h-9 shrink-0 px-3 text-xs lg:hidden">
                Minds
              </button>
              <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3">
                <MindStack minds={main} size={28} />
                <div className="min-w-0">
                  <h1 className="truncate font-pixel text-body">All minds</h1>
                  <p className="truncate text-xs text-particle">Every mind at once. The ones with a view answer.</p>
                </div>
              </div>
            </header>
            {opening ? (
              <p className="px-gutter py-10 font-pixel text-xs text-muted lg:px-8">Opening your chat…</p>
            ) : (
              <AllMinds
                key={`all:${session}`}
                minds={intelligences}
                history={allHistory?.chatId === active ? allHistory : null}
                onChat={(id, title) => {
                  setActive(id);
                  setAddress(id);
                  setRecent((r) => (r.some((x) => x.id === id) ? r : [{ id, kind: "all", handles: [], title, updatedAt: new Date().toISOString() }, ...r]));
                }}
                onContinue={(h) => pick(h)}
              />
            )}
          </section>

          {/* ── right: how it works, who's in ── */}
          <aside data-lenis-prevent aria-label="How All minds works" className="hidden min-h-0 overflow-y-auto border-l border-line px-5 pb-20 pt-5 xl:block">
            <h2 className="font-pixel text-body">How it works</h2>
            <ol className="mt-3 grid list-decimal gap-2 pl-5 text-sm leading-relaxed text-particle marker:font-pixel marker:text-muted">
              <li>Name a coin, and the minds that called it answer, most calls first, each with their record on it.</li>
              <li>Ask anything else, and the minds whose focus fits answer.</li>
              <li>Up to five answer side by side. A mind with nothing on it stays quiet instead of guessing.</li>
            </ol>
            <h3 className="mb-2 mt-8 flex justify-between font-pixel text-[11px] text-muted">
              <span>In the room</span>
              <span className="tabular-nums">{main.length}</span>
            </h3>
            <ul className="grid gap-1">
              {main.map((m) => (
                <li key={m.code}>
                  <button type="button" onClick={() => pick(m.handle)} className="grid w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-3 rounded-chip px-1.5 py-1.5 text-left transition-colors duration-fast hover:bg-panel">
                    <BrainAvatar it={m} size={28} />
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[10px]" style={{ color: m.color }}>{m.code}</span>
                        <span className="truncate font-pixel text-sm">@{m.handle}</span>
                      </span>
                      {m.oneLineMind && <span className="block truncate text-[11px] text-muted">{m.oneLineMind}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </>
      )}

      {!all && (
        <>
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
                  <p className="truncate text-xs text-particle">
                    {isCommunity(it) && <span className="font-pixel text-[10px] text-muted">community{it.addedBy ? ` · added by @${it.addedBy}` : ""} · </span>}
                    {it.oneLineMind ?? "Unofficial AI model built from public posts."}
                  </p>
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
          <aside data-lenis-prevent aria-label={`@${it.handle}'s calls`} className="hidden min-h-0 overflow-y-auto border-l border-line px-5 pb-20 pt-5 xl:block">
            {ready ? <CallsDashboard handle={it.handle} color={it.color} rows={rows} calls={ready.files.calls} stats={ready.files.stats} /> : <p className="font-pixel text-xs text-muted">{ready === null ? "No call record yet." : "Loading…"}</p>}
          </aside>
        </>
      )}
    </div>
  );
}

/** One mind in the left panel. */
function MindRow({ m, selected, active, onPick, note }: { m: Intelligence; selected: boolean; active: string | null; onPick: (h: string) => void; note?: string }) {
  return (
    <button
      type="button"
      onClick={() => onPick(m.handle)}
      // start loading the brain while the pointer is still on its way
      onPointerEnter={() => void fetchBrain(m.handle)}
      onFocus={() => void fetchBrain(m.handle)}
      aria-current={selected && !active}
      className={`grid w-full grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-chip border px-2 py-1.5 text-left transition-colors duration-fast ${
        selected ? (active ? "border-transparent bg-panel/60" : "border-line bg-panel") : "border-transparent hover:bg-panel"
      }`}
    >
      <BrainAvatar it={m} size={32} active={selected} />
      <span className="min-w-0">
        <span className="flex items-baseline gap-1.5 font-mono text-[10px] leading-tight">
          <span style={{ color: m.color }}>{m.code}</span>
          {note && <span className="truncate text-muted">{note}</span>}
        </span>
        <span className="block truncate font-pixel text-sm leading-tight">@{m.handle}</span>
      </span>
    </button>
  );
}

const SHOWN = 5;
const COMMUNITY_OPEN = "ii.app.community";
const people = (n = 0) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

/**
 * Minds people added (under 100k followers): the five most talked-to, a search
 * over all of them, and the full list on /community. Folds away; remembered.
 */
function CommunityList({ minds, selected, active, onPick }: { minds: Intelligence[]; selected: string | null; active: string | null; onPick: (h: string) => void }) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");
  useEffect(() => {
    try {
      if (localStorage.getItem(COMMUNITY_OPEN) === "0") setOpen(false);
    } catch {}
  }, []);
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(COMMUNITY_OPEN, o ? "0" : "1");
      } catch {}
      return !o;
    });
  };
  const ranked = useMemo(() => [...minds].sort((a, b) => (b.people ?? 0) - (a.people ?? 0) || (b.addedAt ?? "").localeCompare(a.addedAt ?? "")), [minds]);
  const needle = q.trim().replace(/^@/, "").toLowerCase();
  let list = needle ? ranked.filter((m) => m.handle.toLowerCase().includes(needle) || (m.oneLineMind ?? "").toLowerCase().includes(needle)) : ranked.slice(0, SHOWN);
  // the open mind stays in sight even when it isn't in the top five
  const current = !needle && selected ? ranked.find((m) => m.handle === selected && !list.includes(m)) : undefined;
  if (current) list = [...list, current];

  return (
    <div className="mt-4">
      <button type="button" onClick={toggle} aria-expanded={open} className="mb-2 flex w-full items-center justify-between px-2 font-pixel text-[11px] text-muted transition-colors duration-fast hover:text-ceramic">
        <span>
          Community <span aria-hidden>{open ? "▾" : "▸"}</span>
        </span>
        <span className="tabular-nums">{minds.length}</span>
      </button>
      {open &&
        (minds.length === 0 ? (
          <AppLink href="/add" className="mx-2 block rounded-chip border border-dashed border-line px-2.5 py-2 text-[11px] leading-snug text-muted transition-colors duration-fast hover:border-line-hover hover:text-particle">
            Minds people add land here. +{community.perPerson} <Ticker /> for every person who talks to yours.
          </AppLink>
        ) : (
          <>
            {minds.length > SHOWN && (
              <label className="mb-1.5 block px-1">
                <span className="sr-only">Search community minds</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search ${minds.length} minds`}
                  spellCheck={false}
                  autoComplete="off"
                  className="h-8 w-full rounded-input border border-line bg-void px-2.5 font-pixel text-xs text-ceramic placeholder:text-muted focus:border-line-hover focus:outline-none"
                />
              </label>
            )}
            <ul>
              {list.map((m) => (
                <li key={m.code}>
                  <MindRow m={m} selected={m.handle === selected} active={active} onPick={onPick} note={people(m.people)} />
                </li>
              ))}
            </ul>
            {needle && list.length === 0 && <p className="px-2 py-1.5 text-[11px] text-muted">No mind matches “{q.trim()}”.</p>}
            {minds.length > SHOWN && !needle && (
              <AppLink href="/community" className="link-quiet mt-1 block px-2 py-1 text-xs">
                All {minds.length} community minds <span className="arrow">↗</span>
              </AppLink>
            )}
          </>
        ))}
    </div>
  );
}
