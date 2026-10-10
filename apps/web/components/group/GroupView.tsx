"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Markdown, TypingIndicator, type Verdict, VerdictChip } from "@/components/chat/bits";
import { ParticleSignature } from "@/components/particles/ParticleSignature";
import { AppLink } from "@/components/ui/AppLink";
import { Popover } from "@/components/ui/Popover";
import { formatCount, type Intelligence } from "@/lib/intelligences";
import { normalizeRefs } from "@/lib/refs";
import type { Reference } from "@/lib/server/data";

const MAX = 4;
const MIN = 2;
const STARTERS = ["ETH or SOL for the next 3 months?", "Would you buy $BTC here?", "What's your one rule for taking profit?", "Biggest mistake you keep making?"];

type Turn = { handle: string; round: number };
type Item =
  | { id: string; kind: "user"; content: string }
  | { id: string; kind: "round"; round: number; rounds: number }
  | {
      id: string;
      kind: "ai";
      handle: string;
      round: number;
      content: string;
      streaming: boolean;
      verdict: Verdict | null;
      refs: Reference[];
      error?: string;
    };

export function GroupView({ available, initial }: { available: Intelligence[]; initial: string[] }) {
  const [members, setMembers] = useState<string[]>(initial);
  const [debate, setDebate] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const byHandle = useMemo(() => new Map(available.map((i) => [i.handle, i])), [available]);
  const lineup = members.map((h) => byHandle.get(h)).filter((i): i is Intelligence => !!i);
  const ready = lineup.length >= MIN;

  // Keep ?with= in the URL so a lineup can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (members.length) url.searchParams.set("with", members.join(","));
    else url.searchParams.delete("with");
    window.history.replaceState(null, "", url);
  }, [members]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: busy ? "auto" : "smooth" });
  }, [items, busy]);

  const toggle = (handle: string) => {
    if (busy) return;
    setMembers((m) => (m.includes(handle) ? m.filter((h) => h !== handle) : m.length >= MAX ? m : [...m, handle]));
    // A new lineup is a new conversation.
    setChatId(null);
  };

  const patch = (id: string, fn: (it: Extract<Item, { kind: "ai" }>) => Partial<Extract<Item, { kind: "ai" }>>) =>
    setItems((all) => all.map((it) => (it.id === id && it.kind === "ai" ? { ...it, ...fn(it) } : it)));

  const speakOne = async (cid: string, turn: Turn, signal: AbortSignal) => {
    const id = `a${Date.now()}${turn.handle}${turn.round}`;
    setItems((all) => [...all, { id, kind: "ai", handle: turn.handle, round: turn.round, content: "", streaming: true, verdict: null, refs: [] }]);
    setSpeaking(turn.handle);
    const res = await fetch("/api/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "speak", chatId: cid, handle: turn.handle, round: turn.round }),
      signal,
    });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      patch(id, () => ({ streaming: false, error: j.error ?? "No answer. Try again." }));
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = raw.match(/^event: (\w+)/m)?.[1];
        const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] ?? "{}");
        if (ev === "delta") patch(id, (m) => ({ content: m.content + data.t }));
        else if (ev === "done") patch(id, () => ({ streaming: false, verdict: data.verdict, refs: data.refs ?? [], content: data.content }));
        else if (ev === "error") patch(id, () => ({ streaming: false, error: data.message }));
      }
    }
    patch(id, (m) => (m.streaming ? { streaming: false } : {}));
  };

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy || !ready) return;
      setBusy(true);
      setInput("");
      setItems((all) => [...all, { id: `u${Date.now()}`, kind: "user", content: q }]);
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch("/api/group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ask", members, message: q, debate, chatId }),
          signal: ctrl.signal,
        });
        const j = await res.json();
        if (!res.ok) {
          setItems((all) => [...all, { id: `e${Date.now()}`, kind: "ai", handle: "", round: 0, content: "", streaming: false, verdict: null, refs: [], error: j.error }]);
          return;
        }
        setChatId(j.chatId);
        let round = 0;
        for (const turn of j.queue as Turn[]) {
          if (ctrl.signal.aborted) break;
          if (turn.round !== round) {
            round = turn.round;
            setItems((all) => [...all, { id: `r${Date.now()}${round}`, kind: "round", round, rounds: j.rounds }]);
          }
          await speakOne(j.chatId, turn, ctrl.signal);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setItems((all) => [...all, { id: `e${Date.now()}`, kind: "ai", handle: "", round: 0, content: "", streaming: false, verdict: null, refs: [], error: "Connection dropped. Try again." }]);
        }
        setItems((all) => all.map((it) => (it.kind === "ai" && it.streaming ? { ...it, streaming: false } : it)));
      } finally {
        abort.current = null;
        setSpeaking(null);
        setBusy(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    // speakOne only touches state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, ready, members, debate, chatId],
  );

  return (
    <div className="mx-auto flex h-[100svh] max-w-site flex-col pt-topbar">
      {/* lineup */}
      <header className="border-b border-line px-gutter py-3 lg:px-8">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-2">
          <h1 className="mr-2 text-body font-medium">Group</h1>
          {lineup.map((it) => (
            <span key={it.handle} className="inline-flex h-9 items-center gap-2 rounded-pill border border-line bg-panel pl-1.5 pr-1">
              <ParticleSignature handle={it.handle} postsParsed={it.postsParsed} postsPerDay={it.postsPerDay} size={22} />
              <span className="font-mono text-xs text-muted">{it.code}</span>
              <span className="font-pixel text-sm text-ceramic">@{it.handle}</span>
              <button
                onClick={() => toggle(it.handle)}
                disabled={busy}
                className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-pill text-muted transition-colors duration-fast hover:text-ceramic disabled:opacity-40"
                aria-label={`Remove @${it.handle}`}
              >
                ×
              </button>
            </span>
          ))}
          {lineup.length < MAX && (
            <Popover label="Add an intelligence" align="start" triggerClassName="btn-line h-9 px-3 text-sm" trigger="+ add">
              <Picker available={available} members={members} onPick={toggle} />
            </Popover>
          )}
          <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-2 text-sm text-particle">
            <input type="checkbox" checked={debate} disabled={busy} onChange={(e) => setDebate(e.target.checked)} className="peer sr-only" />
            <span aria-hidden className="relative h-5 w-9 rounded-pill border border-line bg-panel transition-colors duration-fast peer-checked:border-ceramic peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-ceramic">
              <span className={`absolute top-[3px] h-3 w-3 bg-ceramic transition-[left] duration-fast ${debate ? "left-[19px]" : "left-[3px]"}`} />
            </span>
            Debate
          </label>
        </div>
      </header>

      {/* conversation */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-gutter lg:px-8" aria-live="polite">
        {items.length === 0 ? (
          <Empty available={available} members={members} onPick={toggle} ready={ready} onAsk={send} />
        ) : (
          <ol className="mx-auto max-w-[760px] space-y-7 py-8">
            {items.map((it) => {
              if (it.kind === "user") {
                return (
                  <li key={it.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-panel border border-line bg-panel px-4 py-3 text-body">{it.content}</p>
                  </li>
                );
              }
              if (it.kind === "round") {
                return (
                  <li key={it.id} className="flex items-center gap-3" aria-label={`Debate round ${it.round} of ${it.rounds}`}>
                    <span className="h-px flex-1 bg-line" />
                    <span className="label-mono">
                      Round {it.round}/{it.rounds}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </li>
                );
              }
              const who = byHandle.get(it.handle);
              return (
                <li key={it.id}>
                  {who && (
                    <div className="mb-2 flex items-center gap-2">
                      <ParticleSignature handle={who.handle} postsParsed={who.postsParsed} postsPerDay={who.postsPerDay} size={22} />
                      <span className="font-mono text-xs text-muted">{who.code}</span>
                      <AppLink href={`/i/${who.handle}`} className="font-pixel text-sm text-particle hover:text-ceramic">
                        @{who.handle}
                      </AppLink>
                      {it.streaming && !it.content && <TypingIndicator />}
                    </div>
                  )}
                  {it.error ? <p className="text-body text-muted">{it.error}</p> : <GroupAnswer item={it} />}
                </li>
              );
            })}
            {!busy && <Tally items={items} byHandle={byHandle} />}
          </ol>
        )}
      </div>

      {/* input */}
      <div className="border-t border-line bg-void px-gutter pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:px-8">
        <form
          className="mx-auto flex max-w-[760px] items-end gap-2 rounded-input border border-line bg-panel p-2 transition-colors duration-fast focus-within:border-line-hover"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="group-input" className="sr-only">Ask the group</label>
          <textarea
            id="group-input"
            ref={inputRef}
            rows={1}
            value={input}
            disabled={!ready}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={ready ? "Ask the group… (@handle asks just one)" : `Add ${MIN - lineup.length} more to start`}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-body text-ceramic placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="btn-line h-10 shrink-0 px-3 text-sm" aria-label="Stop">
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!ready || !input.trim()} className="btn-ceramic h-10 w-10 shrink-0 px-0 disabled:opacity-40" aria-label="Send">
              →
            </button>
          )}
        </form>
        <p className="mx-auto mt-2 max-w-[760px] text-xs text-muted">
          {speaking ? `@${speaking} is answering…` : "Unofficial AI models built from public posts. Not affiliated with anyone. Not financial advice."}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function GroupAnswer({ item }: { item: Extract<Item, { kind: "ai" }> }) {
  const [open, setOpen] = useState<Reference | null>(null);
  if (item.streaming) {
    const shown = normalizeRefs(item.content)
      .replace(/\[post:\d+\]/g, "")
      .replace(/\[(p(o(s(t(:[^\]]*)?)?)?)?)?$/, "")
      .replace(/\n*\s*VERDICT:?\s*[A-Z]*\.?\s*$/i, "");
    return (
      <div className="whitespace-pre-wrap text-body leading-relaxed text-ceramic">
        {shown}
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-particle align-baseline" aria-hidden />
      </div>
    );
  }
  const byId = new Map(item.refs.map((r) => [r.postId, r]));
  const parts = normalizeRefs(item.content).split(/(\[post:\d+\])/g);
  return (
    <div>
      <div className="whitespace-pre-wrap text-body leading-relaxed text-ceramic">
        {parts.map((p, i) => {
          const id = p.match(/^\[post:(\d+)\]$/)?.[1];
          if (!id) return <Fragment key={i}>{p}</Fragment>;
          const r = byId.get(id);
          return r ? (
            <button
              key={i}
              onClick={() => setOpen(open?.postId === r.postId ? null : r)}
              className={`mx-0.5 align-baseline font-mono text-xs underline underline-offset-4 hover:text-ceramic ${open?.postId === r.postId ? "text-ceramic decoration-ceramic" : "text-particle decoration-line-hover"}`}
            >
              [{r.n}]
            </button>
          ) : null;
        })}
      </div>
      {(item.verdict || open) && (
        <div className="mt-3 space-y-3">
          {item.verdict && <VerdictChip verdict={item.verdict} />}
          {open && <RefCard r={open} />}
        </div>
      )}
    </div>
  );
}

function RefCard({ r }: { r: Reference }) {
  return (
    <div className="max-w-[560px] rounded-panel border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3 font-mono text-xs text-muted">
        <span>
          {r.kind === "call" ? "Call" : "Post"} · {r.date ?? "—"}
        </span>
        {r.call && (
          <span className="text-particle">
            {r.call.direction.toUpperCase()} {r.call.ticker}
          </span>
        )}
      </div>
      {r.quoted?.text && (
        <p className="mt-3 border-l border-line pl-3 text-sm text-muted">
          {r.quoted.author ? `@${r.quoted.author}: ` : ""}
          {r.quoted.text}
        </p>
      )}
      {r.text && <Markdown text={r.text} className="mt-3 text-sm leading-relaxed text-ceramic" />}
      <a href={r.url} target="_blank" rel="noreferrer" className="link-quiet mt-3 text-xs">
        View on x.com <span className="arrow">↗</span>
      </a>
    </div>
  );
}

/** Where the group landed on the last question: each speaker's latest verdict. */
function Tally({ items, byHandle }: { items: Item[]; byHandle: Map<string, Intelligence> }) {
  const lastUser = items.map((it) => it.kind).lastIndexOf("user");
  const latest = new Map<string, Verdict>();
  for (const it of items.slice(lastUser + 1)) if (it.kind === "ai" && it.verdict) latest.set(it.handle, it.verdict);
  if (latest.size < 2) return null;
  return (
    <li className="rounded-panel border border-line p-4">
      <p className="label-mono">Where the group landed</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {[...latest].map(([h, v]) => (
          <span key={h} className="inline-flex items-center gap-2">
            <span className="font-mono text-xs text-muted">{byHandle.get(h)?.code}</span>
            <VerdictChip verdict={v} />
          </span>
        ))}
      </div>
    </li>
  );
}

function Picker({ available, members, onPick }: { available: Intelligence[]; members: string[]; onPick: (h: string) => void }) {
  const rest = available.filter((i) => !members.includes(i.handle));
  return (
    <ul className="-my-1 w-[260px]">
      {rest.map((it) => (
        <li key={it.handle}>
          <button onClick={() => onPick(it.handle)} className="flex w-full items-center gap-3 rounded-chip px-1 py-2 text-left transition-colors duration-fast hover:bg-panel">
            <ParticleSignature handle={it.handle} postsParsed={it.postsParsed} postsPerDay={it.postsPerDay} size={24} />
            <span className="font-mono text-xs text-muted">{it.code}</span>
            <span className="truncate text-sm text-ceramic">@{it.handle}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Empty({
  available,
  members,
  onPick,
  ready,
  onAsk,
}: {
  available: Intelligence[];
  members: string[];
  onPick: (h: string) => void;
  ready: boolean;
  onAsk: (q: string) => void;
}) {
  return (
    <div className="mx-auto max-w-[860px] py-10">
      <h2 className="text-h2">{ready ? "The group is ready." : "Pick 2–4 intelligences."}</h2>
      <p className="mt-2 max-w-[56ch] text-lead text-particle">
        They answer in turn and can disagree. Turn on Debate and they reply to each other for two more rounds. Start a message with @handle to ask just one.
      </p>
      <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {available.map((it) => {
          const on = members.includes(it.handle);
          const full = !on && members.length >= MAX;
          return (
            <li key={it.handle}>
              <button
                onClick={() => onPick(it.handle)}
                disabled={full}
                aria-pressed={on}
                className={`flex h-full w-full flex-col rounded-card border p-3 text-left transition-colors duration-fast disabled:opacity-40 ${
                  on ? "border-ceramic bg-panel" : "border-line hover:border-line-hover"
                }`}
              >
                <ParticleSignature handle={it.handle} postsParsed={it.postsParsed} postsPerDay={it.postsPerDay} size={40} active={on} />
                <span className="mt-3 font-mono text-xs text-muted">{it.code}</span>
                <span className="truncate font-pixel text-sm text-ceramic">@{it.handle}</span>
                <span className="mt-1 line-clamp-2 text-xs text-muted">{it.oneLineMind ?? `${formatCount(it.postsParsed)} posts`}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {ready && (
        <div className="mt-8 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button key={s} onClick={() => onAsk(s)} className="rounded-pill border border-line px-3 py-1.5 text-xs text-particle transition-colors duration-fast hover:border-line-hover hover:text-ceramic">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
